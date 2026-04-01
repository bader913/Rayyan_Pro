import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { createVerify } from 'crypto';

export type DistributionMode = 'trial' | 'standard';
export type EffectiveLicenseMode = 'active' | 'trial' | 'read_only';

export type LicenseReason =
  | 'development_bypass'
  | 'active_valid'
  | 'activation_missing'
  | 'activation_invalid'
  | 'device_mismatch'
  | 'activation_expired'
  | 'trial_active'
  | 'trial_expired'
  | 'clock_tamper'
  | 'state_error';

type ActivationPayload = {
  customer_name?: string;
  device_fingerprint: string;
  issued_at: string;
  expires_at?: string | null;
};

type ActivationEnvelope = {
  payload: ActivationPayload;
  signature: string;
};

type TrialStateFile = {
  version: 1;
  trial_started_at: string;
  trial_expires_at: string;
  last_seen_at: string;
  last_reason?: string | null;
};

export type LicenseStatus = {
  distribution_mode: DistributionMode;
  mode: EffectiveLicenseMode;
  writable: boolean;
  reason: LicenseReason;
  message: string;
  customer_name: string | null;
  device_fingerprint: string | null;
  activation_expires_at: string | null;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  last_seen_at: string | null;
  activation_file_present: boolean;
  activation_file_path: string;
  state_file_path: string;
};

const DISTRIBUTION_MODE: DistributionMode =
  process.env.RAYYAN_DISTRIBUTION === 'trial' ? 'trial' : 'standard';

const DEVICE_FINGERPRINT = String(process.env.RAYYAN_DEVICE_FINGERPRINT || '').trim() || null;

const LICENSE_STATE_FILE =
  String(process.env.RAYYAN_LICENSE_STATE_FILE || '').trim() ||
  join(process.cwd(), 'license.state.json');

const ACTIVATION_FILE =
  String(process.env.RAYYAN_ACTIVATION_FILE || '').trim() ||
  join(process.cwd(), 'activation.lic');

const TRIAL_DURATION_MS =
  Number(process.env.RAYYAN_TRIAL_DURATION_MS || 24 * 60 * 60 * 1000) || 24 * 60 * 60 * 1000;

const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

const DEV_BYPASS =
  process.env.NODE_ENV !== 'production' &&
  process.env.RAYYAN_ENABLE_LICENSE_IN_DEV !== 'true';

function getPublicKeyPem(): string {
  return String(process.env.RAYYAN_LICENSE_PUBLIC_KEY_PEM || '')
    .replace(/\\n/g, '\n')
    .trim();
}

function messageForReason(reason: LicenseReason): string {
  switch (reason) {
    case 'development_bypass':
      return 'وضع التطوير: التحقق من الترخيص معطّل مؤقتًا.';
    case 'active_valid':
      return 'النسخة مفعّلة بشكل صحيح.';
    case 'activation_missing':
      return 'لا يوجد ملف تفعيل صالح لهذه النسخة.';
    case 'activation_invalid':
      return 'ملف التفعيل غير صالح أو التوقيع غير صحيح.';
    case 'device_mismatch':
      return 'ملف التفعيل لا يخص هذا الجهاز.';
    case 'activation_expired':
      return 'انتهت صلاحية التفعيل.';
    case 'trial_active':
      return 'النسخة التجريبية ما زالت فعالة.';
    case 'trial_expired':
      return 'انتهت مدة النسخة التجريبية وتحولت إلى قراءة فقط.';
    case 'clock_tamper':
      return 'تم اكتشاف عبث غير طبيعي في وقت الجهاز، وتم تحويل النسخة إلى قراءة فقط.';
    case 'state_error':
    default:
      return 'تعذر قراءة حالة الترخيص المحلية.';
  }
}

function toIsoNow() {
  return new Date().toISOString();
}

function parseTimeMs(value?: string | null) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : NaN;
}

async function ensureParentDir(filePath: string) {
  await fs.mkdir(dirname(filePath), { recursive: true });
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function serializeActivationPayload(payload: ActivationPayload) {
  return JSON.stringify({
    customer_name: String(payload.customer_name || '').trim() || null,
    device_fingerprint: String(payload.device_fingerprint || '').trim(),
    issued_at: String(payload.issued_at || '').trim(),
    expires_at: payload.expires_at ? String(payload.expires_at).trim() : null,
  });
}

function buildStatus(
  input: Partial<LicenseStatus> & Pick<LicenseStatus, 'mode' | 'writable' | 'reason'>
): LicenseStatus {
  return {
    distribution_mode: DISTRIBUTION_MODE,
    mode: input.mode,
    writable: input.writable,
    reason: input.reason,
    message: messageForReason(input.reason),
    customer_name: input.customer_name ?? null,
    device_fingerprint: input.device_fingerprint ?? DEVICE_FINGERPRINT ?? null,
    activation_expires_at: input.activation_expires_at ?? null,
    trial_started_at: input.trial_started_at ?? null,
    trial_expires_at: input.trial_expires_at ?? null,
    last_seen_at: input.last_seen_at ?? null,
    activation_file_present: input.activation_file_present ?? false,
    activation_file_path: ACTIVATION_FILE,
    state_file_path: LICENSE_STATE_FILE,
  };
}

async function readActivationEnvelope(): Promise<ActivationEnvelope | null> {
  if (!(await fileExists(ACTIVATION_FILE))) return null;

  const raw = await fs.readFile(ACTIVATION_FILE, 'utf8');
  const parsed = JSON.parse(raw) as ActivationEnvelope;

  if (!parsed || typeof parsed !== 'object') return null;
  if (!parsed.payload || typeof parsed.payload !== 'object') return null;
  if (typeof parsed.signature !== 'string' || !parsed.signature.trim()) return null;

  return parsed;
}

function verifyActivationSignature(envelope: ActivationEnvelope): boolean {
  const publicKeyPem = getPublicKeyPem();
  if (!publicKeyPem) return false;

  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(serializeActivationPayload(envelope.payload));
    verifier.end();

    return verifier.verify(publicKeyPem, Buffer.from(envelope.signature, 'base64'));
  } catch {
    return false;
  }
}

async function resolveActivationStatus(nowMs: number): Promise<LicenseStatus | null> {
  const activationFilePresent = await fileExists(ACTIVATION_FILE);
  const envelope = await readActivationEnvelope();

  if (!envelope) {
    return activationFilePresent
      ? buildStatus({
          mode: 'read_only',
          writable: false,
          reason: 'activation_invalid',
          activation_file_present: true,
        })
      : null;
  }

  if (!verifyActivationSignature(envelope)) {
    return buildStatus({
      mode: 'read_only',
      writable: false,
      reason: 'activation_invalid',
      activation_file_present: true,
      customer_name: envelope.payload.customer_name ?? null,
      activation_expires_at: envelope.payload.expires_at ?? null,
    });
  }

  const payloadFingerprint = String(envelope.payload.device_fingerprint || '').trim();

  if (!payloadFingerprint || !DEVICE_FINGERPRINT || payloadFingerprint !== DEVICE_FINGERPRINT) {
    return buildStatus({
      mode: 'read_only',
      writable: false,
      reason: 'device_mismatch',
      activation_file_present: true,
      customer_name: envelope.payload.customer_name ?? null,
      activation_expires_at: envelope.payload.expires_at ?? null,
    });
  }

  const expiresAtMs = parseTimeMs(envelope.payload.expires_at ?? null);
  if (Number.isFinite(expiresAtMs) && expiresAtMs < nowMs) {
    return buildStatus({
      mode: 'read_only',
      writable: false,
      reason: 'activation_expired',
      activation_file_present: true,
      customer_name: envelope.payload.customer_name ?? null,
      activation_expires_at: envelope.payload.expires_at ?? null,
    });
  }

  return buildStatus({
    mode: 'active',
    writable: true,
    reason: 'active_valid',
    activation_file_present: true,
    customer_name: envelope.payload.customer_name ?? null,
    activation_expires_at: envelope.payload.expires_at ?? null,
  });
}

async function readTrialState(): Promise<TrialStateFile | null> {
  if (!(await fileExists(LICENSE_STATE_FILE))) return null;

  const raw = await fs.readFile(LICENSE_STATE_FILE, 'utf8');
  const parsed = JSON.parse(raw) as TrialStateFile;

  if (!parsed || typeof parsed !== 'object') return null;
  if (!parsed.trial_started_at || !parsed.trial_expires_at || !parsed.last_seen_at) return null;

  return parsed;
}

async function writeTrialState(state: TrialStateFile) {
  await ensureParentDir(LICENSE_STATE_FILE);
  await fs.writeFile(LICENSE_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

async function resolveTrialStatus(nowMs: number): Promise<LicenseStatus> {
  try {
    let state = await readTrialState();

    if (!state) {
      const nowIso = new Date(nowMs).toISOString();
      const expiresIso = new Date(nowMs + TRIAL_DURATION_MS).toISOString();

      state = {
        version: 1,
        trial_started_at: nowIso,
        trial_expires_at: expiresIso,
        last_seen_at: nowIso,
        last_reason: 'trial_active',
      };

      await writeTrialState(state);
    }

    const lastSeenMs = parseTimeMs(state.last_seen_at);
    const expiresAtMs = parseTimeMs(state.trial_expires_at);

    if (Number.isFinite(lastSeenMs) && nowMs + CLOCK_SKEW_TOLERANCE_MS < lastSeenMs) {
      const nextState: TrialStateFile = {
        ...state,
        last_reason: 'clock_tamper',
      };
      await writeTrialState(nextState);

      return buildStatus({
        mode: 'read_only',
        writable: false,
        reason: 'clock_tamper',
        trial_started_at: state.trial_started_at,
        trial_expires_at: state.trial_expires_at,
        last_seen_at: state.last_seen_at,
      });
    }

    if (Number.isFinite(expiresAtMs) && expiresAtMs < nowMs) {
      const nextState: TrialStateFile = {
        ...state,
        last_seen_at: new Date(nowMs).toISOString(),
        last_reason: 'trial_expired',
      };
      await writeTrialState(nextState);

      return buildStatus({
        mode: 'read_only',
        writable: false,
        reason: 'trial_expired',
        trial_started_at: state.trial_started_at,
        trial_expires_at: state.trial_expires_at,
        last_seen_at: nextState.last_seen_at,
      });
    }

    const nextState: TrialStateFile = {
      ...state,
      last_seen_at: new Date(nowMs).toISOString(),
      last_reason: 'trial_active',
    };
    await writeTrialState(nextState);

    return buildStatus({
      mode: 'trial',
      writable: true,
      reason: 'trial_active',
      trial_started_at: state.trial_started_at,
      trial_expires_at: state.trial_expires_at,
      last_seen_at: nextState.last_seen_at,
    });
  } catch {
    return buildStatus({
      mode: 'read_only',
      writable: false,
      reason: 'state_error',
    });
  }
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  if (DEV_BYPASS) {
    return buildStatus({
      mode: 'active',
      writable: true,
      reason: 'development_bypass',
    });
  }

  const nowMs = Date.now();

  const activationStatus = await resolveActivationStatus(nowMs);
  if (activationStatus?.mode === 'active') {
    return activationStatus;
  }

  if (DISTRIBUTION_MODE === 'trial') {
    return resolveTrialStatus(nowMs);
  }

  return (
    activationStatus ??
    buildStatus({
      mode: 'read_only',
      writable: false,
      reason: 'activation_missing',
    })
  );
}