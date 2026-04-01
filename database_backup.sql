--
-- PostgreSQL database dump
--

\restrict U4Zt3x0THBPGQIdBCqbi7ZjxgOgCdX1I3Zcvm9DUkGw9Rg9zkgeEcbELPjRDfXf

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.suppliers DROP CONSTRAINT IF EXISTS suppliers_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.supplier_account_transactions DROP CONSTRAINT IF EXISTS supplier_account_transactions_supplier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.supplier_account_transactions DROP CONSTRAINT IF EXISTS supplier_account_transactions_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.shifts DROP CONSTRAINT IF EXISTS shifts_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.shifts DROP CONSTRAINT IF EXISTS shifts_pos_terminal_id_fkey;
ALTER TABLE IF EXISTS ONLY public.settings DROP CONSTRAINT IF EXISTS settings_updated_by_fkey;
ALTER TABLE IF EXISTS ONLY public.sales DROP CONSTRAINT IF EXISTS sales_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales DROP CONSTRAINT IF EXISTS sales_shift_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales_returns DROP CONSTRAINT IF EXISTS sales_returns_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales_returns DROP CONSTRAINT IF EXISTS sales_returns_shift_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales_returns DROP CONSTRAINT IF EXISTS sales_returns_sale_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales_returns DROP CONSTRAINT IF EXISTS sales_returns_customer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales_return_items DROP CONSTRAINT IF EXISTS sales_return_items_sale_item_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales_return_items DROP CONSTRAINT IF EXISTS sales_return_items_return_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales_return_items DROP CONSTRAINT IF EXISTS sales_return_items_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales DROP CONSTRAINT IF EXISTS sales_pos_terminal_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales DROP CONSTRAINT IF EXISTS sales_customer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sale_items DROP CONSTRAINT IF EXISTS sale_items_sale_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sale_items DROP CONSTRAINT IF EXISTS sale_items_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.purchases DROP CONSTRAINT IF EXISTS purchases_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.purchases DROP CONSTRAINT IF EXISTS purchases_supplier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.purchase_items DROP CONSTRAINT IF EXISTS purchase_items_purchase_id_fkey;
ALTER TABLE IF EXISTS ONLY public.purchase_items DROP CONSTRAINT IF EXISTS purchase_items_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.products DROP CONSTRAINT IF EXISTS products_supplier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.products DROP CONSTRAINT IF EXISTS products_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.products DROP CONSTRAINT IF EXISTS products_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.product_stock_movements DROP CONSTRAINT IF EXISTS product_stock_movements_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.product_stock_movements DROP CONSTRAINT IF EXISTS product_stock_movements_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.expenses DROP CONSTRAINT IF EXISTS expenses_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.expenses DROP CONSTRAINT IF EXISTS expenses_shift_id_fkey;
ALTER TABLE IF EXISTS ONLY public.customers DROP CONSTRAINT IF EXISTS customers_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.customer_account_transactions DROP CONSTRAINT IF EXISTS customer_account_transactions_customer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.customer_account_transactions DROP CONSTRAINT IF EXISTS customer_account_transactions_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_parent_id_fkey;
ALTER TABLE IF EXISTS ONLY public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
DROP INDEX IF EXISTS public.idx_users_role;
DROP INDEX IF EXISTS public.idx_users_is_active;
DROP INDEX IF EXISTS public.idx_user_sessions_user_id;
DROP INDEX IF EXISTS public.idx_user_sessions_token;
DROP INDEX IF EXISTS public.idx_user_sessions_expires;
DROP INDEX IF EXISTS public.idx_stock_mv_type;
DROP INDEX IF EXISTS public.idx_stock_mv_ref;
DROP INDEX IF EXISTS public.idx_stock_mv_product;
DROP INDEX IF EXISTS public.idx_stock_mv_created;
DROP INDEX IF EXISTS public.idx_shifts_user_id;
DROP INDEX IF EXISTS public.idx_shifts_terminal;
DROP INDEX IF EXISTS public.idx_shifts_status;
DROP INDEX IF EXISTS public.idx_sat_supplier_id;
DROP INDEX IF EXISTS public.idx_sat_created_by;
DROP INDEX IF EXISTS public.idx_sat_created_at;
DROP INDEX IF EXISTS public.idx_sales_terminal;
DROP INDEX IF EXISTS public.idx_sales_shift_id;
DROP INDEX IF EXISTS public.idx_sales_returns_user_id;
DROP INDEX IF EXISTS public.idx_sales_returns_sale_id;
DROP INDEX IF EXISTS public.idx_sales_returns_created_at;
DROP INDEX IF EXISTS public.idx_sales_return_items_return_id;
DROP INDEX IF EXISTS public.idx_sales_return_items_product_id;
DROP INDEX IF EXISTS public.idx_sales_invoice_number;
DROP INDEX IF EXISTS public.idx_sales_customer_id;
DROP INDEX IF EXISTS public.idx_sales_created_at;
DROP INDEX IF EXISTS public.idx_sale_items_sale_id;
DROP INDEX IF EXISTS public.idx_sale_items_product_id;
DROP INDEX IF EXISTS public.idx_purchases_user_id;
DROP INDEX IF EXISTS public.idx_purchases_supplier_id;
DROP INDEX IF EXISTS public.idx_purchases_created_at;
DROP INDEX IF EXISTS public.idx_purchase_items_purchase_id;
DROP INDEX IF EXISTS public.idx_purchase_items_product_id;
DROP INDEX IF EXISTS public.idx_products_supplier;
DROP INDEX IF EXISTS public.idx_products_name_barcode;
DROP INDEX IF EXISTS public.idx_products_category;
DROP INDEX IF EXISTS public.idx_products_barcode;
DROP INDEX IF EXISTS public.idx_expenses_created_at;
DROP INDEX IF EXISTS public.idx_customers_phone;
DROP INDEX IF EXISTS public.idx_customers_name;
DROP INDEX IF EXISTS public.idx_cat_customer_id;
DROP INDEX IF EXISTS public.idx_cat_created_at_desc;
DROP INDEX IF EXISTS public.idx_cat_created_at;
DROP INDEX IF EXISTS public.idx_audit_user;
DROP INDEX IF EXISTS public.idx_audit_entity;
DROP INDEX IF EXISTS public.idx_audit_created;
DROP INDEX IF EXISTS public.idx_audit_action_entity;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_refresh_token_key;
ALTER TABLE IF EXISTS ONLY public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_pkey;
ALTER TABLE IF EXISTS ONLY public.suppliers DROP CONSTRAINT IF EXISTS suppliers_pkey;
ALTER TABLE IF EXISTS ONLY public.supplier_account_transactions DROP CONSTRAINT IF EXISTS supplier_account_transactions_pkey;
ALTER TABLE IF EXISTS ONLY public.shifts DROP CONSTRAINT IF EXISTS shifts_pkey;
ALTER TABLE IF EXISTS ONLY public.settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE IF EXISTS ONLY public.sales_returns DROP CONSTRAINT IF EXISTS sales_returns_return_number_key;
ALTER TABLE IF EXISTS ONLY public.sales_returns DROP CONSTRAINT IF EXISTS sales_returns_pkey;
ALTER TABLE IF EXISTS ONLY public.sales_return_items DROP CONSTRAINT IF EXISTS sales_return_items_pkey;
ALTER TABLE IF EXISTS ONLY public.sales DROP CONSTRAINT IF EXISTS sales_pkey;
ALTER TABLE IF EXISTS ONLY public.sales DROP CONSTRAINT IF EXISTS sales_invoice_number_key;
ALTER TABLE IF EXISTS ONLY public.sale_items DROP CONSTRAINT IF EXISTS sale_items_pkey;
ALTER TABLE IF EXISTS ONLY public.purchases DROP CONSTRAINT IF EXISTS purchases_pkey;
ALTER TABLE IF EXISTS ONLY public.purchases DROP CONSTRAINT IF EXISTS purchases_invoice_number_key;
ALTER TABLE IF EXISTS ONLY public.purchase_items DROP CONSTRAINT IF EXISTS purchase_items_pkey;
ALTER TABLE IF EXISTS ONLY public.products DROP CONSTRAINT IF EXISTS products_pkey;
ALTER TABLE IF EXISTS ONLY public.product_stock_movements DROP CONSTRAINT IF EXISTS product_stock_movements_pkey;
ALTER TABLE IF EXISTS ONLY public.pos_terminals DROP CONSTRAINT IF EXISTS pos_terminals_pkey;
ALTER TABLE IF EXISTS ONLY public.pos_terminals DROP CONSTRAINT IF EXISTS pos_terminals_code_key;
ALTER TABLE IF EXISTS ONLY public.invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_pkey;
ALTER TABLE IF EXISTS ONLY public.expenses DROP CONSTRAINT IF EXISTS expenses_pkey;
ALTER TABLE IF EXISTS ONLY public.customers DROP CONSTRAINT IF EXISTS customers_pkey;
ALTER TABLE IF EXISTS ONLY public.customer_account_transactions DROP CONSTRAINT IF EXISTS customer_account_transactions_pkey;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_pkey;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE IF EXISTS ONLY public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_pkey;
ALTER TABLE IF EXISTS ONLY public._migrations DROP CONSTRAINT IF EXISTS _migrations_pkey;
ALTER TABLE IF EXISTS ONLY public._migrations DROP CONSTRAINT IF EXISTS _migrations_filename_key;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.user_sessions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.suppliers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.supplier_account_transactions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.shifts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.sales_returns ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.sales_return_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.sales ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.sale_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.purchases ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.purchase_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.products ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.product_stock_movements ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.pos_terminals ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.expenses ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.customers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.customer_account_transactions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.categories ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.audit_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public._migrations ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP SEQUENCE IF EXISTS public.user_sessions_id_seq;
DROP TABLE IF EXISTS public.user_sessions;
DROP SEQUENCE IF EXISTS public.suppliers_id_seq;
DROP TABLE IF EXISTS public.suppliers;
DROP SEQUENCE IF EXISTS public.supplier_account_transactions_id_seq;
DROP TABLE IF EXISTS public.supplier_account_transactions;
DROP SEQUENCE IF EXISTS public.shifts_id_seq;
DROP TABLE IF EXISTS public.shifts;
DROP TABLE IF EXISTS public.settings;
DROP SEQUENCE IF EXISTS public.sales_returns_id_seq;
DROP TABLE IF EXISTS public.sales_returns;
DROP SEQUENCE IF EXISTS public.sales_return_items_id_seq;
DROP TABLE IF EXISTS public.sales_return_items;
DROP SEQUENCE IF EXISTS public.sales_id_seq;
DROP TABLE IF EXISTS public.sales;
DROP SEQUENCE IF EXISTS public.sale_items_id_seq;
DROP TABLE IF EXISTS public.sale_items;
DROP SEQUENCE IF EXISTS public.purchases_id_seq;
DROP TABLE IF EXISTS public.purchases;
DROP SEQUENCE IF EXISTS public.purchase_items_id_seq;
DROP TABLE IF EXISTS public.purchase_items;
DROP SEQUENCE IF EXISTS public.products_id_seq;
DROP TABLE IF EXISTS public.products;
DROP SEQUENCE IF EXISTS public.product_stock_movements_id_seq;
DROP TABLE IF EXISTS public.product_stock_movements;
DROP SEQUENCE IF EXISTS public.pos_terminals_id_seq;
DROP TABLE IF EXISTS public.pos_terminals;
DROP TABLE IF EXISTS public.invoice_sequences;
DROP SEQUENCE IF EXISTS public.expenses_id_seq;
DROP TABLE IF EXISTS public.expenses;
DROP SEQUENCE IF EXISTS public.customers_id_seq;
DROP TABLE IF EXISTS public.customers;
DROP SEQUENCE IF EXISTS public.customer_account_transactions_id_seq;
DROP TABLE IF EXISTS public.customer_account_transactions;
DROP SEQUENCE IF EXISTS public.categories_id_seq;
DROP TABLE IF EXISTS public.categories;
DROP SEQUENCE IF EXISTS public.audit_logs_id_seq;
DROP TABLE IF EXISTS public.audit_logs;
DROP SEQUENCE IF EXISTS public._migrations_id_seq;
DROP TABLE IF EXISTS public._migrations;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._migrations (
    id integer NOT NULL,
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now()
);


--
-- Name: _migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public._migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: _migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public._migrations_id_seq OWNED BY public._migrations.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    user_id bigint,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id bigint,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id bigint NOT NULL,
    name text NOT NULL,
    parent_id bigint,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: customer_account_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_account_transactions (
    id bigint NOT NULL,
    customer_id bigint NOT NULL,
    transaction_type text NOT NULL,
    reference_id bigint,
    reference_type text,
    debit_amount numeric(15,4) DEFAULT 0,
    credit_amount numeric(15,4) DEFAULT 0,
    balance_after numeric(15,4) NOT NULL,
    currency_code text DEFAULT 'USD'::text,
    exchange_rate numeric(15,6) DEFAULT 1,
    amount_original numeric(15,4),
    note text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT customer_account_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['sale'::text, 'payment'::text, 'return'::text, 'adjustment'::text])))
);


--
-- Name: customer_account_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_account_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_account_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_account_transactions_id_seq OWNED BY public.customer_account_transactions.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id bigint NOT NULL,
    name text NOT NULL,
    phone text,
    address text,
    customer_type text DEFAULT 'retail'::text,
    credit_limit numeric(15,4) DEFAULT 0,
    balance numeric(15,4) DEFAULT 0,
    notes text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT customers_customer_type_check CHECK ((customer_type = ANY (ARRAY['retail'::text, 'wholesale'::text])))
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id bigint NOT NULL,
    description text NOT NULL,
    amount numeric(15,4) NOT NULL,
    currency text DEFAULT 'USD'::text,
    category text,
    shift_id bigint,
    user_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expenses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.expenses_id_seq OWNED BY public.expenses.id;


--
-- Name: invoice_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_sequences (
    prefix text NOT NULL,
    last_number bigint DEFAULT 0
);


--
-- Name: pos_terminals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_terminals (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    location text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pos_terminals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_terminals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_terminals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_terminals_id_seq OWNED BY public.pos_terminals.id;


--
-- Name: product_stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_stock_movements (
    id bigint NOT NULL,
    product_id bigint NOT NULL,
    movement_type text NOT NULL,
    quantity_change numeric(15,4) NOT NULL,
    quantity_before numeric(15,4) NOT NULL,
    quantity_after numeric(15,4) NOT NULL,
    reference_id bigint,
    reference_type text,
    note text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT product_stock_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['purchase'::text, 'sale'::text, 'return_in'::text, 'return_out'::text, 'adjustment_in'::text, 'adjustment_out'::text, 'initial'::text, 'damage'::text, 'transfer_in'::text, 'transfer_out'::text]))),
    CONSTRAINT product_stock_movements_reference_type_check CHECK ((reference_type = ANY (ARRAY['sale'::text, 'purchase'::text, 'sale_return'::text, 'purchase_return'::text, 'adjustment'::text, NULL::text])))
);


--
-- Name: product_stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_stock_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_stock_movements_id_seq OWNED BY public.product_stock_movements.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id bigint NOT NULL,
    barcode text,
    name text NOT NULL,
    category_id bigint,
    unit text DEFAULT 'قطعة'::text NOT NULL,
    is_weighted boolean DEFAULT false,
    purchase_price numeric(15,4) DEFAULT 0,
    retail_price numeric(15,4) DEFAULT 0,
    wholesale_price numeric(15,4),
    wholesale_min_qty numeric(15,4) DEFAULT 1,
    stock_quantity numeric(15,4) DEFAULT 0,
    min_stock_level numeric(15,4) DEFAULT 5,
    expiry_date date,
    image_url text,
    supplier_id bigint,
    notes text,
    is_active boolean DEFAULT true,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: purchase_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_items (
    id bigint NOT NULL,
    purchase_id bigint NOT NULL,
    product_id bigint NOT NULL,
    quantity numeric(15,4) NOT NULL,
    unit_price numeric(15,4) NOT NULL,
    total_price numeric(15,4) NOT NULL
);


--
-- Name: purchase_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_items_id_seq OWNED BY public.purchase_items.id;


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id bigint NOT NULL,
    invoice_number text NOT NULL,
    supplier_id bigint,
    user_id bigint NOT NULL,
    total_amount numeric(15,4) NOT NULL,
    paid_amount numeric(15,4) DEFAULT 0,
    purchase_currency text DEFAULT 'USD'::text,
    exchange_rate numeric(15,6) DEFAULT 1,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchases_id_seq OWNED BY public.purchases.id;


--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_items (
    id bigint NOT NULL,
    sale_id bigint NOT NULL,
    product_id bigint NOT NULL,
    quantity numeric(15,4) NOT NULL,
    unit_price numeric(15,4) NOT NULL,
    discount numeric(15,4) DEFAULT 0,
    total_price numeric(15,4) NOT NULL,
    price_type text DEFAULT 'retail'::text,
    CONSTRAINT sale_items_price_type_check CHECK ((price_type = ANY (ARRAY['retail'::text, 'wholesale'::text, 'custom'::text])))
);


--
-- Name: sale_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sale_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sale_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sale_items_id_seq OWNED BY public.sale_items.id;


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id bigint NOT NULL,
    invoice_number text NOT NULL,
    customer_id bigint,
    user_id bigint NOT NULL,
    shift_id bigint,
    pos_terminal_id bigint,
    sale_type text DEFAULT 'retail'::text,
    subtotal numeric(15,4) DEFAULT 0 NOT NULL,
    discount numeric(15,4) DEFAULT 0,
    total_amount numeric(15,4) NOT NULL,
    paid_amount numeric(15,4) DEFAULT 0,
    payment_method text,
    sale_currency text DEFAULT 'USD'::text,
    exchange_rate numeric(15,6) DEFAULT 1,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT sales_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'credit'::text, 'mixed'::text]))),
    CONSTRAINT sales_sale_type_check CHECK ((sale_type = ANY (ARRAY['retail'::text, 'wholesale'::text])))
);


--
-- Name: sales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sales_id_seq OWNED BY public.sales.id;


--
-- Name: sales_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_return_items (
    id bigint NOT NULL,
    return_id bigint NOT NULL,
    sale_item_id bigint,
    product_id bigint NOT NULL,
    quantity numeric(15,4) NOT NULL,
    unit_price numeric(15,4) NOT NULL,
    total_price numeric(15,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: sales_return_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sales_return_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sales_return_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sales_return_items_id_seq OWNED BY public.sales_return_items.id;


--
-- Name: sales_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_returns (
    id bigint NOT NULL,
    return_number text NOT NULL,
    sale_id bigint NOT NULL,
    customer_id bigint,
    user_id bigint NOT NULL,
    shift_id bigint,
    return_method text NOT NULL,
    total_amount numeric(15,4) DEFAULT 0 NOT NULL,
    reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT sales_returns_return_method_check CHECK ((return_method = ANY (ARRAY['cash_refund'::text, 'debt_discount'::text, 'stock_only'::text])))
);


--
-- Name: sales_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sales_returns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sales_returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sales_returns_id_seq OWNED BY public.sales_returns.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value text,
    updated_by bigint,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    pos_terminal_id bigint,
    currency_code text DEFAULT 'USD'::text,
    exchange_rate numeric(15,6) DEFAULT 1,
    opening_balance numeric(15,4) DEFAULT 0,
    opening_balance_original numeric(15,4) DEFAULT 0,
    opening_note text,
    closing_note text,
    opened_at timestamp with time zone DEFAULT now(),
    closed_at timestamp with time zone,
    status text DEFAULT 'open'::text NOT NULL,
    closing_cash_counted numeric(15,4) DEFAULT 0,
    expected_cash numeric(15,4) DEFAULT 0,
    difference numeric(15,4) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT shifts_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shifts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shifts_id_seq OWNED BY public.shifts.id;


--
-- Name: supplier_account_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_account_transactions (
    id bigint NOT NULL,
    supplier_id bigint NOT NULL,
    transaction_type text NOT NULL,
    reference_id bigint,
    reference_type text,
    debit_amount numeric(15,4) DEFAULT 0,
    credit_amount numeric(15,4) DEFAULT 0,
    balance_after numeric(15,4) NOT NULL,
    currency_code text DEFAULT 'USD'::text,
    exchange_rate numeric(15,6) DEFAULT 1,
    amount_original numeric(15,4),
    note text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT supplier_account_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['purchase'::text, 'payment'::text, 'adjustment'::text])))
);


--
-- Name: supplier_account_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_account_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_account_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplier_account_transactions_id_seq OWNED BY public.supplier_account_transactions.id;


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id bigint NOT NULL,
    name text NOT NULL,
    phone text,
    address text,
    balance numeric(15,4) DEFAULT 0,
    notes text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suppliers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suppliers_id_seq OWNED BY public.suppliers.id;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    refresh_token text NOT NULL,
    ip_address text,
    user_agent text,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_sessions_id_seq OWNED BY public.user_sessions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL,
    is_active boolean DEFAULT true,
    is_protected boolean DEFAULT false,
    avatar_url text,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'cashier'::text, 'warehouse'::text])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: _migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migrations ALTER COLUMN id SET DEFAULT nextval('public._migrations_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: customer_account_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_account_transactions ALTER COLUMN id SET DEFAULT nextval('public.customer_account_transactions_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: expenses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses ALTER COLUMN id SET DEFAULT nextval('public.expenses_id_seq'::regclass);


--
-- Name: pos_terminals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_terminals ALTER COLUMN id SET DEFAULT nextval('public.pos_terminals_id_seq'::regclass);


--
-- Name: product_stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock_movements ALTER COLUMN id SET DEFAULT nextval('public.product_stock_movements_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: purchase_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_items_id_seq'::regclass);


--
-- Name: purchases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases ALTER COLUMN id SET DEFAULT nextval('public.purchases_id_seq'::regclass);


--
-- Name: sale_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items ALTER COLUMN id SET DEFAULT nextval('public.sale_items_id_seq'::regclass);


--
-- Name: sales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales ALTER COLUMN id SET DEFAULT nextval('public.sales_id_seq'::regclass);


--
-- Name: sales_return_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_return_items ALTER COLUMN id SET DEFAULT nextval('public.sales_return_items_id_seq'::regclass);


--
-- Name: sales_returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_returns ALTER COLUMN id SET DEFAULT nextval('public.sales_returns_id_seq'::regclass);


--
-- Name: shifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts ALTER COLUMN id SET DEFAULT nextval('public.shifts_id_seq'::regclass);


--
-- Name: supplier_account_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_account_transactions ALTER COLUMN id SET DEFAULT nextval('public.supplier_account_transactions_id_seq'::regclass);


--
-- Name: suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN id SET DEFAULT nextval('public.suppliers_id_seq'::regclass);


--
-- Name: user_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions ALTER COLUMN id SET DEFAULT nextval('public.user_sessions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: _migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._migrations (id, filename, applied_at) FROM stdin;
1	001_initial_schema.sql	2026-03-18 18:48:20.694676+00
2	002_stock_movements.sql	2026-03-18 19:07:31.485289+00
3	003_phase8_performance_indexes.sql	2026-03-18 21:26:38.587045+00
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, user_id, action, entity_type, entity_id, old_data, new_data, ip_address, user_agent, created_at) FROM stdin;
1	1	login	auth	1	\N	{"role": "admin", "username": "admin"}	127.0.0.1	curl/8.14.1	2026-03-18 21:24:00.165569+00
2	1	bulk_update	setting	\N	\N	{"shop_name": "متجر ريان برو"}	127.0.0.1	\N	2026-03-18 21:24:00.509586+00
3	1	login	auth	1	\N	{"role": "admin", "username": "admin"}	127.0.0.1	curl/8.14.1	2026-03-18 21:24:11.723134+00
4	1	update	setting	\N	{"key": "shop_name", "value": "متجر ريان برو"}	{"key": "shop_name", "value": "ريان برو - نظام المبيعات"}	127.0.0.1	\N	2026-03-18 21:24:11.780748+00
5	1	login	auth	1	\N	{"role": "admin", "username": "admin"}	127.0.0.1	curl/8.14.1	2026-03-18 21:25:25.71756+00
6	1	login	auth	1	\N	{"role": "admin", "username": "admin"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-03-18 21:47:00.190185+00
7	1	bulk_update	setting	\N	\N	{"currency": "USD", "show_usd": "true", "shop_name": "ريان برو - نظام المبيعات", "shop_phone": "096xxxxxxx", "theme_mode": "dark", "usd_to_aed": "3.67", "usd_to_sar": "3.75", "usd_to_syp": "11000", "usd_to_try": "44", "theme_color": "#059669", "shop_address": "", "enable_shifts": "false", "receipt_footer": "شكراً لزيارتكم!", "low_stock_threshold": "10"}	127.0.0.1	\N	2026-03-18 21:47:35.472836+00
8	1	bulk_update	setting	\N	\N	{"currency": "USD", "show_usd": "true", "shop_name": "ريان برو - نظام المبيعات", "shop_phone": "096xxxxxxx", "theme_mode": "dark", "usd_to_aed": "3.67", "usd_to_sar": "3.75", "usd_to_syp": "11000", "usd_to_try": "44", "theme_color": "#2c4940", "shop_address": "", "enable_shifts": "false", "receipt_footer": "شكراً لزيارتكم!", "low_stock_threshold": "10"}	127.0.0.1	\N	2026-03-18 21:47:54.999228+00
9	1	create	sale	3	\N	{"total_amount": "75100.0000", "invoice_number": "INV-2026-000003", "payment_method": "cash"}	127.0.0.1	\N	2026-03-18 21:48:48.150792+00
10	1	create	sale	4	\N	{"total_amount": "700.0000", "invoice_number": "INV-2026-000004", "payment_method": "credit"}	127.0.0.1	\N	2026-03-18 21:53:06.956955+00
11	1	deactivate	user	3	\N	{"is_active": false}	127.0.0.1	\N	2026-03-18 21:56:33.703154+00
12	1	activate	user	3	\N	{"is_active": true}	127.0.0.1	\N	2026-03-18 21:56:37.798612+00
13	1	create	product	6	\N	{"name": "سكر", "barcode": "1002031203"}	127.0.0.1	\N	2026-03-18 21:58:33.229986+00
14	1	bulk_update	setting	\N	\N	{"currency": "USD", "show_usd": "true", "shop_name": "ريان برو - نظام المبيعات", "shop_phone": "096xxxxxxx", "theme_mode": "light", "usd_to_aed": "3.67", "usd_to_sar": "3.75", "usd_to_syp": "11000", "usd_to_try": "44", "theme_color": "#2c4940", "shop_address": "", "enable_shifts": "false", "receipt_footer": "شكراً لزيارتكم!", "low_stock_threshold": "10"}	127.0.0.1	\N	2026-03-18 22:00:58.986527+00
15	1	bulk_update	setting	\N	\N	{"currency": "USD", "show_usd": "true", "shop_name": "ريان برو - نظام المبيعات", "shop_phone": "096xxxxxxx", "theme_mode": "dark", "usd_to_aed": "3.67", "usd_to_sar": "3.75", "usd_to_syp": "11000", "usd_to_try": "44", "theme_color": "#c6d30d", "shop_address": "", "enable_shifts": "false", "receipt_footer": "شكراً لزيارتكم!", "low_stock_threshold": "10"}	127.0.0.1	\N	2026-03-18 22:02:05.183786+00
16	1	bulk_update	setting	\N	\N	{"currency": "TRY", "show_usd": "true", "shop_name": "ماركت الوحيد", "shop_phone": "090812321", "theme_mode": "dark", "usd_to_aed": "3.67", "usd_to_sar": "3.75", "usd_to_syp": "115", "usd_to_try": "44", "theme_color": "#c6d30d", "shop_address": "ادلب", "enable_shifts": "false", "receipt_footer": "شكراً لزيارتكم!", "low_stock_threshold": "10"}	127.0.0.1	\N	2026-03-18 22:02:41.754051+00
17	1	create	sale	5	\N	{"total_amount": "2000.0000", "invoice_number": "INV-2026-000005", "payment_method": "cash"}	127.0.0.1	\N	2026-03-18 22:04:51.530087+00
18	1	bulk_update	setting	\N	\N	{"currency": "TRY", "show_usd": "true", "shop_name": "ماركت الوحيد", "shop_phone": "090812321", "theme_mode": "light", "usd_to_aed": "3.67", "usd_to_sar": "3.75", "usd_to_syp": "115", "usd_to_try": "44", "theme_color": "#c6d30d", "shop_address": "ادلب", "enable_shifts": "false", "receipt_footer": "شكراً لزيارتكم!", "low_stock_threshold": "10"}	127.0.0.1	\N	2026-03-18 22:05:02.413715+00
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, name, parent_id, created_at) FROM stdin;
1	مواد غذائية	\N	2026-03-18 18:48:26.034673+00
2	مشروبات	\N	2026-03-18 18:48:26.034673+00
3	منظفات	\N	2026-03-18 18:48:26.034673+00
4	ألبان وأجبان	\N	2026-03-18 18:48:26.034673+00
5	خضروات وفواكه	\N	2026-03-18 18:48:26.034673+00
6	دخان	\N	2026-03-18 18:48:26.034673+00
7	أغذية ومعلبات	\N	2026-03-18 19:22:30.005197+00
8	أدوية ومستلزمات طبية	\N	2026-03-18 19:22:30.15893+00
\.


--
-- Data for Name: customer_account_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_account_transactions (id, customer_id, transaction_type, reference_id, reference_type, debit_amount, credit_amount, balance_after, currency_code, exchange_rate, amount_original, note, created_by, created_at) FROM stdin;
1	1	sale	1	sale	33750.0000	0.0000	33750.0000	USD	1.000000	\N	بيع فاتورة INV-2026-000001	1	2026-03-18 19:45:19.58651+00
2	2	sale	4	sale	700.0000	0.0000	700.0000	USD	1.000000	\N	بيع فاتورة INV-2026-000004	1	2026-03-18 21:53:06.939116+00
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customers (id, name, phone, address, customer_type, credit_limit, balance, notes, created_by, created_at, updated_at) FROM stdin;
1	أبو خالد للجملة	0991234567	\N	wholesale	0.0000	33750.0000	\N	1	2026-03-18 19:45:08.778109+00	2026-03-18 19:45:19.58651+00
2	بر	صضث	2	retail	13.0000	700.0000	صث	1	2026-03-18 21:52:51.89433+00	2026-03-18 21:53:06.939116+00
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expenses (id, description, amount, currency, category, shift_id, user_id, created_at) FROM stdin;
\.


--
-- Data for Name: invoice_sequences; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoice_sequences (prefix, last_number) FROM stdin;
RET	0
PUR	1
INV	5
\.


--
-- Data for Name: pos_terminals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pos_terminals (id, code, name, location, is_active, created_at) FROM stdin;
1	POS-01	كاشير رئيسي	المدخل الرئيسي	t	2026-03-18 18:48:26.034673+00
2	POS-02	كاشير احتياطي	المدخل الجانبي	t	2026-03-18 18:48:26.034673+00
\.


--
-- Data for Name: product_stock_movements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_stock_movements (id, product_id, movement_type, quantity_change, quantity_before, quantity_after, reference_id, reference_type, note, created_by, created_at) FROM stdin;
1	1	initial	50.0000	0.0000	50.0000	\N	\N	رصيد افتتاحي	1	2026-03-18 19:22:30.897249+00
2	2	initial	20.5000	0.0000	20.5000	\N	\N	رصيد افتتاحي	1	2026-03-18 19:22:31.176297+00
3	3	initial	100.0000	0.0000	100.0000	\N	\N	رصيد افتتاحي	1	2026-03-18 19:22:31.432713+00
4	1	adjustment_out	-15.0000	50.0000	35.0000	\N	adjustment	جرد يدوي	1	2026-03-18 19:24:16.539715+00
5	1	adjustment_out	-15.0000	35.0000	20.0000	\N	adjustment	تعديل اختبار	1	2026-03-18 19:25:23.962502+00
6	5	initial	30.0000	0.0000	30.0000	\N	\N	رصيد افتتاحي	1	2026-03-18 19:25:24.0571+00
7	1	sale	-15.0000	20.0000	5.0000	1	sale	فاتورة INV-2026-000001	1	2026-03-18 19:45:19.58651+00
8	2	sale	-1.3500	20.5000	19.1500	1	sale	فاتورة INV-2026-000001	1	2026-03-18 19:45:19.58651+00
9	1	sale	-1.0000	5.0000	4.0000	2	sale	فاتورة INV-2026-000002	1	2026-03-18 19:45:54.94263+00
11	1	purchase	10.0000	4.0000	14.0000	2	purchase	فاتورة شراء PUR-2026-000001	1	2026-03-18 20:59:42.816259+00
12	1	sale	-4.0000	14.0000	10.0000	3	sale	فاتورة INV-2026-000003	1	2026-03-18 21:48:48.137835+00
13	2	sale	-1.0000	19.1500	18.1500	3	sale	فاتورة INV-2026-000003	1	2026-03-18 21:48:48.137835+00
14	5	sale	-3.0000	30.0000	27.0000	3	sale	فاتورة INV-2026-000003	1	2026-03-18 21:48:48.137835+00
15	5	sale	-1.0000	27.0000	26.0000	4	sale	فاتورة INV-2026-000004	1	2026-03-18 21:53:06.939116+00
16	1	sale	-1.0000	10.0000	9.0000	5	sale	فاتورة INV-2026-000005	1	2026-03-18 22:04:51.518538+00
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (id, barcode, name, category_id, unit, is_weighted, purchase_price, retail_price, wholesale_price, wholesale_min_qty, stock_quantity, min_stock_level, expiry_date, image_url, supplier_id, notes, is_active, created_by, created_at, updated_at) FROM stdin;
4	\N	منتج المخزن التجريبي	\N	قطعة	f	100.0000	150.0000	\N	1.0000	0.0000	5.0000	\N	\N	\N	\N	t	3	2026-03-18 19:23:35.012745+00	2026-03-18 19:23:35.012745+00
3	6221034102100	شيبس ليز صغير	\N	قطعة	f	700.0000	1000.0000	\N	1.0000	100.0000	20.0000	\N	\N	\N	\N	f	1	2026-03-18 19:22:31.432713+00	2026-03-18 19:24:16.744127+00
2	\N	لحم غنم طازج	\N	كغ	t	55000.0000	65000.0000	\N	1.0000	18.1500	2.0000	\N	\N	\N	\N	t	1	2026-03-18 19:22:31.176297+00	2026-03-18 21:48:48.137835+00
5	\N	منتج جديد للتأكيد	\N	علبة	f	500.0000	700.0000	\N	1.0000	26.0000	5.0000	\N	\N	\N	\N	t	1	2026-03-18 19:25:24.0571+00	2026-03-18 21:53:06.939116+00
6	1002031203	سكر	1	كغ	t	12.0000	3.0000	2.0000	2.0000	0.0000	5.0010	2026-04-08	\N	1	\N	t	1	2026-03-18 21:58:33.196041+00	2026-03-18 21:59:33.248707+00
1	6221034102100	شيبس ليز كبير	7	قطعة	f	5.0000	2000.0000	1800.0000	10.0000	9.0000	10.0000	\N	\N	\N	\N	t	1	2026-03-18 19:22:30.897249+00	2026-03-18 22:04:51.518538+00
\.


--
-- Data for Name: purchase_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_items (id, purchase_id, product_id, quantity, unit_price, total_price) FROM stdin;
2	2	1	10.0000	5.0000	50.0000
\.


--
-- Data for Name: purchases; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchases (id, invoice_number, supplier_id, user_id, total_amount, paid_amount, purchase_currency, exchange_rate, notes, created_at, updated_at) FROM stdin;
2	PUR-2026-000001	\N	1	50.0000	30.0000	USD	1.000000	\N	2026-03-18 20:59:42.816259+00	2026-03-18 20:59:42.816259+00
\.


--
-- Data for Name: sale_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sale_items (id, sale_id, product_id, quantity, unit_price, discount, total_price, price_type) FROM stdin;
1	1	1	15.0000	1800.0000	0.0000	27000.0000	wholesale
2	1	2	1.3500	65000.0000	0.0000	87750.0000	retail
3	2	1	1.0000	2000.0000	0.0000	2000.0000	retail
4	3	1	4.0000	2000.0000	0.0000	8000.0000	retail
5	3	2	1.0000	65000.0000	0.0000	65000.0000	retail
6	3	5	3.0000	700.0000	0.0000	2100.0000	retail
7	4	5	1.0000	700.0000	0.0000	700.0000	retail
8	5	1	1.0000	2000.0000	0.0000	2000.0000	retail
\.


--
-- Data for Name: sales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales (id, invoice_number, customer_id, user_id, shift_id, pos_terminal_id, sale_type, subtotal, discount, total_amount, paid_amount, payment_method, sale_currency, exchange_rate, notes, created_at, updated_at) FROM stdin;
1	INV-2026-000001	1	1	1	1	wholesale	114750.0000	1000.0000	113750.0000	80000.0000	mixed	USD	1.000000	اختبار المرحلة 3	2026-03-18 19:45:19.58651+00	2026-03-18 19:45:19.58651+00
2	INV-2026-000002	\N	1	1	1	retail	2000.0000	0.0000	2000.0000	2000.0000	cash	USD	1.000000	\N	2026-03-18 19:45:54.94263+00	2026-03-18 19:45:54.94263+00
3	INV-2026-000003	\N	1	2	1	retail	75100.0000	0.0000	75100.0000	75100.0000	cash	USD	1.000000	\N	2026-03-18 21:48:48.137835+00	2026-03-18 21:48:48.137835+00
4	INV-2026-000004	2	1	2	1	retail	700.0000	0.0000	700.0000	0.0000	credit	USD	1.000000	\N	2026-03-18 21:53:06.939116+00	2026-03-18 21:53:06.939116+00
5	INV-2026-000005	\N	1	2	1	retail	2000.0000	0.0000	2000.0000	2000.0000	cash	USD	1.000000	\N	2026-03-18 22:04:51.518538+00	2026-03-18 22:04:51.518538+00
\.


--
-- Data for Name: sales_return_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales_return_items (id, return_id, sale_item_id, product_id, quantity, unit_price, total_price, created_at) FROM stdin;
\.


--
-- Data for Name: sales_returns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales_returns (id, return_number, sale_id, customer_id, user_id, shift_id, return_method, total_amount, reason, notes, created_at) FROM stdin;
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settings (key, value, updated_by, updated_at) FROM stdin;
currency	TRY	1	2026-03-18 22:05:02.379676+00
enable_shifts	false	1	2026-03-18 22:05:02.381875+00
low_stock_threshold	10	1	2026-03-18 22:05:02.384447+00
receipt_footer	شكراً لزيارتكم!	1	2026-03-18 22:05:02.387439+00
shop_address	ادلب	1	2026-03-18 22:05:02.389822+00
shop_name	ماركت الوحيد	1	2026-03-18 22:05:02.392716+00
shop_phone	090812321	1	2026-03-18 22:05:02.395298+00
show_usd	true	1	2026-03-18 22:05:02.398044+00
theme_color	#c6d30d	1	2026-03-18 22:05:02.400198+00
theme_mode	light	1	2026-03-18 22:05:02.402488+00
usd_to_aed	3.67	1	2026-03-18 22:05:02.404838+00
usd_to_sar	3.75	1	2026-03-18 22:05:02.407124+00
usd_to_syp	115	1	2026-03-18 22:05:02.409242+00
usd_to_try	44	1	2026-03-18 22:05:02.411297+00
\.


--
-- Data for Name: shifts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shifts (id, user_id, pos_terminal_id, currency_code, exchange_rate, opening_balance, opening_balance_original, opening_note, closing_note, opened_at, closed_at, status, closing_cash_counted, expected_cash, difference, created_at, updated_at) FROM stdin;
1	1	1	USD	1.000000	500000.0000	0.0000	اختبار المرحلة 3	إغلاق اختبار	2026-03-18 19:44:59.435308+00	2026-03-18 19:46:44.827762+00	closed	580000.0000	582000.0000	-2000.0000	2026-03-18 19:44:59.435308+00	2026-03-18 19:46:44.827762+00
2	1	1	USD	1.000000	120.0000	0.0000	\N	\N	2026-03-18 21:48:11.464895+00	\N	open	0.0000	0.0000	0.0000	2026-03-18 21:48:11.464895+00	2026-03-18 21:48:11.464895+00
\.


--
-- Data for Name: supplier_account_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.supplier_account_transactions (id, supplier_id, transaction_type, reference_id, reference_type, debit_amount, credit_amount, balance_after, currency_code, exchange_rate, amount_original, note, created_by, created_at) FROM stdin;
1	1	payment	\N	\N	10.0000	0.0000	0.0000	USD	1.000000	10.0000	دفعة تجريبية	1	2026-03-18 21:07:04.444199+00
\.


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.suppliers (id, name, phone, address, balance, notes, created_by, created_at, updated_at) FROM stdin;
2	مستودع النور	\N	\N	0.0000	\N	1	2026-03-18 19:22:30.639366+00	2026-03-18 19:22:30.639366+00
1	شركة الأمل للتوزيع	0911234567	\N	0.0000	\N	1	2026-03-18 19:22:30.598354+00	2026-03-18 21:07:04.444199+00
3	مورد بدر	3423	حلبض	0.0000	سي	1	2026-03-18 21:49:37.296458+00	2026-03-18 21:49:37.296458+00
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_sessions (id, user_id, refresh_token, ip_address, user_agent, expires_at, created_at) FROM stdin;
1	1	9fc94e7acd536f9ef913cdfa2a821a326bcb08dc2948e9af06877fc1250c9ea290a89fd2c5fe3a34ed2a11daa58d4a366b53c388e8bacd245eccf5df6e994fbf	127.0.0.1	curl/8.14.1	2026-03-25 18:50:13.867+00	2026-03-18 18:50:13.868324+00
2	1	63012c95a3974b16d53a6c2486c353a77c9971fcfb0bc4c34548018b7232919708c5c265fc77978e61f7fd73596787beefcddd5181850f92916c77987c1f1e1d	127.0.0.1	curl/8.14.1	2026-03-25 18:50:17.657+00	2026-03-18 18:50:17.657935+00
3	1	8547076a5a70c559070d788fbbea79923087ef681488ccfe9908b7c9aa6990cd6c5bad634bec9fc39dee8140ab9bd26b52465e43fb240eacd25781ab5ca2685b	127.0.0.1	curl/8.14.1	2026-03-25 18:51:16.893+00	2026-03-18 18:51:16.894117+00
4	1	9a1c036c58c995cb697f99072fc62289437c800d1911a9abb6feea3f076ff35ca84716f7b1558a2461757650300f59caeb5e6bdae9baaa31d185044fd235b9b9	127.0.0.1	curl/8.14.1	2026-03-25 18:51:23.321+00	2026-03-18 18:51:23.322119+00
5	1	dcc5d2a0288fa11f475dbbf286b54c85e62c4a3d904b08d3a7e1010253e6afcb16a0755b3b4df66657ea87a9ceaeb8b1f269b349803ea749a623ddb0cb5fa6a0	127.0.0.1	curl/8.14.1	2026-03-25 19:10:16.423+00	2026-03-18 19:10:16.424694+00
6	2	14a7a898311e23d302080c08b369f430f062efc3ec6cbbc63b4b0e2fe32d19eb716e778ffc6a15b50fa9a4166d47db5794a778cd24bebaa2e57137992e9ae09b	127.0.0.1	curl/8.14.1	2026-03-25 19:10:17.459+00	2026-03-18 19:10:17.459322+00
7	1	146b9e8b9075b5ccd88892a30e57fb64e14874e0f9db3430bb02bd37d2db43ce2747c15a4ae19381b2d500a9f0b8fa69f667d68736ec3447c1d7e92c592fd4ef	127.0.0.1	curl/8.14.1	2026-03-25 19:10:52.599+00	2026-03-18 19:10:52.600242+00
8	1	49e18a18ef3d4c7d5e1a4de7365145dc16b67299ca5d48ddae5949c9f61ff9ad1ac572cf69195ee08787dfec61eeab8fad14ca95f078ecc5cafe21b605e72184	127.0.0.1	curl/8.14.1	2026-03-25 19:22:29.549+00	2026-03-18 19:22:29.550693+00
9	1	99f63df559b32584d3f1921bbccd9d74c3ad574b756f5eb13a16ebf8e6ab1299dab806b62c44b612c3f35bf3da8f9ce64c021e6417692f64fd3548197910b43b	127.0.0.1	curl/8.14.1	2026-03-25 19:22:53.433+00	2026-03-18 19:22:53.433696+00
10	1	30efa62fb7c32ea9246f513c9a2a5b0381278f5b2ffba71d5f9f187b83a318aff8732268f374e929beae61ddd1a14789b8e4a65319700150e27e1984409470da	127.0.0.1	curl/8.14.1	2026-03-25 19:23:33.48+00	2026-03-18 19:23:33.481167+00
12	2	542ec252bd82461023bea60a084437d38f9d76901e919d2acb85593e3893a01bf1d563b22504b0c001c4fe092afac99f9472159f9f6e0add8eaf070fb00125e5	127.0.0.1	curl/8.14.1	2026-03-25 19:23:35.202+00	2026-03-18 19:23:35.202498+00
13	1	aba1f8e2ccdf8a52bcedecaacd341a7014eb5d81b850308e3cb6fb3917b85263bd30220b1ff5db8f3505f3ca57b2b7f096f1e8f7e7ef23e91ad21fba08439bba	127.0.0.1	curl/8.14.1	2026-03-25 19:24:16.132+00	2026-03-18 19:24:16.132489+00
14	1	35ffe972040afeed6d3ad0b57ec59ab58caf2fa7e92472311dcfd3a4e1254fd979f5536e830d4455337edd157f014dc325228a1c470e6c2679bccbcea7b8538d	127.0.0.1	curl/8.14.1	2026-03-25 19:25:23.748+00	2026-03-18 19:25:23.749202+00
15	1	d3f7e4a4cee4ea780d804b7430d74004e775254da4847a7aaec2073fadcb6b76cb7f5ac989bac4f7d52b8ec1bf1bfce20c151b44b5f8a3b104c10c19be2947c3	127.0.0.1	curl/8.14.1	2026-03-25 19:44:03.923+00	2026-03-18 19:44:03.924121+00
16	1	a923e9cf20fbde9676e00491d410e912ec942f56679d87651a4a12e87f9ae83336be52907d00cb375d8064ceab127b260dbdea013c8103ebf72f7af2595cbce8	127.0.0.1	curl/8.14.1	2026-03-25 19:44:15.964+00	2026-03-18 19:44:15.964774+00
17	1	701bc69fa94e5631c5ce80e61df23a7815203a9e40bed555abbfda635b0c5561a770f9c4de799dcefc9c06fdc56cfb60fe83bd41edf26dc388de3198b30a74d1	127.0.0.1	curl/8.14.1	2026-03-25 19:44:20.039+00	2026-03-18 19:44:20.039825+00
18	1	e4a7a4478abee92be8dc93281e7ff67289a277cf9d957f88af58cc1020bb2a3ccc797508f5c407a45875c00757bc64d9a778856d87602a97ba94f28853188266	127.0.0.1	curl/8.14.1	2026-03-25 19:44:59.34+00	2026-03-18 19:44:59.340887+00
19	1	e8408dcba072dc0d13eb11f1a94b2bcee5722517237fa502c3283969fcea3cca48254e0a334a2a37b15a4ed88cebc78503572d52e5c5964b862b4af76cf4b5ed	127.0.0.1	curl/8.14.1	2026-03-25 19:45:08.66+00	2026-03-18 19:45:08.66078+00
20	1	7629f53c7993f7b5f3482d90aff9ab44f1045ab54a070d38abbb6fe9ec6632d32f2d13d76cf15168a36154986b15bb788f86f1c46e9d73ba6194044564d5db6d	127.0.0.1	curl/8.14.1	2026-03-25 19:45:19.531+00	2026-03-18 19:45:19.531769+00
21	1	08e0dd61bdf4df25de42ab55da3226b6a4149614bb1ed3dbe130c597fcdf44473dc59d7962ac9dea20481d47a3db0617571a10d49c102e490b14f5216ad31086	127.0.0.1	curl/8.14.1	2026-03-25 19:45:29.808+00	2026-03-18 19:45:29.808515+00
22	1	b5f8e021028bd276795079789395a3abe6355847285dd4b26856783791365c2a1844d8f80451526932a7b46c187a7255d86a81983e378a917a145d27b5728ae5	127.0.0.1	curl/8.14.1	2026-03-25 19:45:54.755+00	2026-03-18 19:45:54.756203+00
23	1	6a0a7cce340ea370d15618238a5285e1199545270140743a06608cf7387f5ff45df5d8ba354ec539ff8f813d9d67ae1198e8d8bff8a2ccc31bf163d656b1be47	127.0.0.1	curl/8.14.1	2026-03-25 19:46:04.686+00	2026-03-18 19:46:04.687256+00
24	1	496c11ade90470c29a8cb93319a165b6fd3d7f3d45478e95a88a585d4b96d09c869cfda082ae51ff85c5c46e5da4b7a5995194d87efd228bc872add119917960	127.0.0.1	curl/8.14.1	2026-03-25 19:46:44.772+00	2026-03-18 19:46:44.772877+00
25	1	be5984ac9232aeee33f0e8e966a426117c157e4f218fabf907b4a178608dd53de39cc376d96e0c050eaead6903462e73c7fcfa0ad3c50d16a4b7d72b7d699cf1	127.0.0.1	curl/8.14.1	2026-03-25 20:58:42.615+00	2026-03-18 20:58:42.615846+00
26	1	c9457c804f905a7d6c22e573866ba9e1483ab8a36b6e300b364ada9a6066bb931a32ee29bbdbb91111664433c434d82d6184d694667f2f0bf7eb486a211ec1f4	127.0.0.1	curl/8.14.1	2026-03-25 20:58:53.658+00	2026-03-18 20:58:53.658386+00
27	1	0a35003dd11fbdf0a7eeaea71583f93e192e628b83a43db3443c7df3f39b0be4512d937a95a18d098d7de0eb0fc505ed5e9ff7d657b4f73e75264e6c319ecbcc	127.0.0.1	curl/8.14.1	2026-03-25 20:59:02.099+00	2026-03-18 20:59:02.100316+00
28	1	e919e6a50b4a5f8ae10415a84838e7646924175bcf8dfcaec028963c6b923eb4bbe3288c22eaf2fcffc2cf6dd19d0bffd30685920582e3a5de92ac1dfad7dab9	127.0.0.1	curl/8.14.1	2026-03-25 20:59:42.753+00	2026-03-18 20:59:42.754698+00
29	1	995510a70d8f8b004e482b62639dc3beeab0f106b96b99c1361dbe02030c6060cd4f65044437d9df1f6a174f5e60b091264bdc53519dfab1eedb96620a07dacb	127.0.0.1	curl/8.14.1	2026-03-25 21:07:03.616+00	2026-03-18 21:07:03.617521+00
30	1	ac1cbabd2f76edaf92cb0e5d14f667c628d17021a78ad07863073621022b28b3b2b2bd20c84821d1b569624296a43923dcb5fb526069e964de2a66b8608f4f21	127.0.0.1	curl/8.14.1	2026-03-25 21:13:54.843+00	2026-03-18 21:13:54.844217+00
31	1	534b616b8e795c8c9f399d609b98725bb82f7e7c85084fea51a1b94a0f0a92197dd50534a8e01a7d8bd357ff03b505a839f8d72a4b00e82c7795eecdd5d7d073	127.0.0.1	curl/8.14.1	2026-03-25 21:13:59.588+00	2026-03-18 21:13:59.588937+00
32	1	bb4b05a0b33647385ff6418ff9fb6bdada16afb90c6ab2a19f4222701290d92fc230ac94cacf8a33ad94366339902a6b8ecc3d37c9dc5b7d62151c148ca99ec5	127.0.0.1	curl/8.14.1	2026-03-25 21:14:03.721+00	2026-03-18 21:14:03.721713+00
33	1	bae0e14b92596fdc4c5171f9dff1de3cc36d2b2555e40de110359e949cdcfea00f7667dccb346385537bb219cb58cb5b569515575826b66918c253d04415b57d	127.0.0.1	curl/8.14.1	2026-03-25 21:15:21.222+00	2026-03-18 21:15:21.22351+00
34	1	58270d4570c8684097c6e121cdd7a76e7d3274c924921be6517b693f78046bba690c81ee6f40a465b44dc1cc68e5cbcf9533257b4b501484df643c018c1dc9d1	127.0.0.1	curl/8.14.1	2026-03-25 21:15:28.576+00	2026-03-18 21:15:28.576552+00
35	1	32a4f1cd348e147784091c3ba4f3c1347409ada795a85fbc3d9ed44943cc2e03190cba4ee0abf7cb94f7164376ca38d57c057280d9e4b3ad26dc4cc9c2997375	127.0.0.1	curl/8.14.1	2026-03-25 21:15:32.786+00	2026-03-18 21:15:32.786966+00
36	1	b1b83550b110e6e048bb0bbee7f2b614445c4b7d03af86e66968e12ebc20de8041070fb59d9ade9c16801b5f0224511585d5b75273107b74b7a2e60284a8ed5a	127.0.0.1	curl/8.14.1	2026-03-25 21:16:31.739+00	2026-03-18 21:16:31.740472+00
37	1	1ea1c6a92a283580b2f57263f1309fed9d65bca01d1c1ecf112fb8b0dc4de2f6eabaefd52b71aeaeb64c0103411989906628445c9e8e99c58c4717b8a5dffd7c	127.0.0.1	curl/8.14.1	2026-03-25 21:16:46.997+00	2026-03-18 21:16:46.998663+00
38	1	635139288aeafd8826a1c6e148aaa121581802a0d9c6a753d8d3c83ea1998f7818a02179d99f2ac4c9d0a8f52161f456c7637548e0de499036599ff245c7ad2e	127.0.0.1	curl/8.14.1	2026-03-25 21:17:16.803+00	2026-03-18 21:17:16.804102+00
39	1	bff4be462485593e5157c4d4d9aba175ab9e76c0615fd86005d2f337d9bde2ab45e3b88c4ac20fd61627286bf51b9afa9af3cb84f6124f3f6dd582fd19fb17f9	127.0.0.1	curl/8.14.1	2026-03-25 21:17:29.666+00	2026-03-18 21:17:29.666628+00
40	1	ae542bf7eb3db35916d82451e811486cb0beac68436a96320e6bac12617a1e14d80948753897860a1c077b75b4a8ab365af2d95403342bb64fea4af8a11dbae2	127.0.0.1	curl/8.14.1	2026-03-25 21:17:52.001+00	2026-03-18 21:17:52.0018+00
41	1	88e5b39fc48c5cea2c70b702aa8c76b287171489e368cabb1ee575bb2f35d0b3b12e2b21d6522dd009aa5f88caf0cced6f953411ca3fbdbea060cde0ebd18ff4	127.0.0.1	curl/8.14.1	2026-03-25 21:18:02.981+00	2026-03-18 21:18:02.982158+00
42	1	cb64cbe775b18297aec076692d8f9040757e92c483c4bac4c0a74d4c1759430b8acb8740b76a51833d1faaaea0838de3dbe8153f860e0858ccd7a7e0d4368e5a	127.0.0.1	curl/8.14.1	2026-03-25 21:24:00.12+00	2026-03-18 21:24:00.121728+00
43	1	fdf619043f9a4f92a282bf6a766ab3dbdf8856ec7015ffb33824bbe69d63343800eba8bd7e4a6771b343b177f65ba521c6541863f4cad437f426ccf5d5400de6	127.0.0.1	curl/8.14.1	2026-03-25 21:24:11.717+00	2026-03-18 21:24:11.717566+00
44	1	8fe78b5eecc516c21539f6922725b63b032fee39ffa2eb75aab0d17dfa08fbd78b45a355762b4aaf49abc1b15b8d165eb1ff5b5b767b3748f553605aba6dbd67	127.0.0.1	curl/8.14.1	2026-03-25 21:25:25.68+00	2026-03-18 21:25:25.681099+00
45	1	d8c28645d5d02e75e54cd3a973cfb7cb7e8ebf396252120b0867df3da62dd68b1e6e148866ad93f6b367cc2e5f52fd3d7c789c8ac430ef5962ba48f7fca00d6a	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	2026-03-25 21:46:59.826+00	2026-03-18 21:46:59.827193+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, password_hash, full_name, role, is_active, is_protected, avatar_url, last_login_at, created_at, updated_at) FROM stdin;
4	test_manager	$2b$10$76pA6WED4JCFcS9PDB00Y./tXHen/TPDn0ntu2NyNysgXOFpJAF2a	مدير تجريبي معدّل	manager	f	f	\N	\N	2026-03-18 19:10:16.78543+00	2026-03-18 19:10:17.319854+00
1	admin	$2b$10$vKMmlFG2Lx3nDGfyEUYwIul7N27apADir8Mdv3LtrwLl5vgjSFDDq	المدير العام	admin	t	t	\N	2026-03-18 21:47:00.088985+00	2026-03-18 18:48:26.034673+00	2026-03-18 18:48:26.034673+00
3	warehouse1	$2b$10$1WdCYgLwqRduYIT5/nER3Oi2h1JuxH0ddqR4JlNgaBPuTR.fNZnhC	موظف مخزن	warehouse	t	f	\N	2026-03-18 19:23:34.953403+00	2026-03-18 18:48:26.034673+00	2026-03-18 21:56:37.79534+00
2	cashier1	$2b$10$97Huf98Y7OzMoOOl35ruKe8wJg5zuQrwh2jCnmum7AHn9c4VGZMI6	موظف كاشير 1	cashier	t	f	\N	2026-03-18 19:23:35.205745+00	2026-03-18 18:48:26.034673+00	2026-03-18 18:48:26.034673+00
\.


--
-- Name: _migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public._migrations_id_seq', 3, true);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 18, true);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categories_id_seq', 8, true);


--
-- Name: customer_account_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_account_transactions_id_seq', 2, true);


--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customers_id_seq', 2, true);


--
-- Name: expenses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.expenses_id_seq', 1, false);


--
-- Name: pos_terminals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pos_terminals_id_seq', 2, true);


--
-- Name: product_stock_movements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_stock_movements_id_seq', 16, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.products_id_seq', 6, true);


--
-- Name: purchase_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_items_id_seq', 2, true);


--
-- Name: purchases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchases_id_seq', 2, true);


--
-- Name: sale_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sale_items_id_seq', 8, true);


--
-- Name: sales_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sales_id_seq', 5, true);


--
-- Name: sales_return_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sales_return_items_id_seq', 1, false);


--
-- Name: sales_returns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sales_returns_id_seq', 1, false);


--
-- Name: shifts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shifts_id_seq', 2, true);


--
-- Name: supplier_account_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.supplier_account_transactions_id_seq', 1, true);


--
-- Name: suppliers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.suppliers_id_seq', 3, true);


--
-- Name: user_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_sessions_id_seq', 45, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 4, true);


--
-- Name: _migrations _migrations_filename_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_filename_key UNIQUE (filename);


--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: categories categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: customer_account_transactions customer_account_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_account_transactions
    ADD CONSTRAINT customer_account_transactions_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: invoice_sequences invoice_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_sequences
    ADD CONSTRAINT invoice_sequences_pkey PRIMARY KEY (prefix);


--
-- Name: pos_terminals pos_terminals_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_terminals
    ADD CONSTRAINT pos_terminals_code_key UNIQUE (code);


--
-- Name: pos_terminals pos_terminals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_terminals
    ADD CONSTRAINT pos_terminals_pkey PRIMARY KEY (id);


--
-- Name: product_stock_movements product_stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock_movements
    ADD CONSTRAINT product_stock_movements_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: purchase_items purchase_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_invoice_number_key UNIQUE (invoice_number);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sales sales_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_invoice_number_key UNIQUE (invoice_number);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: sales_return_items sales_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_return_items
    ADD CONSTRAINT sales_return_items_pkey PRIMARY KEY (id);


--
-- Name: sales_returns sales_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_returns
    ADD CONSTRAINT sales_returns_pkey PRIMARY KEY (id);


--
-- Name: sales_returns sales_returns_return_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_returns
    ADD CONSTRAINT sales_returns_return_number_key UNIQUE (return_number);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: supplier_account_transactions supplier_account_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_account_transactions
    ADD CONSTRAINT supplier_account_transactions_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_refresh_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_refresh_token_key UNIQUE (refresh_token);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_audit_action_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action_entity ON public.audit_logs USING btree (action, entity_type);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_cat_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cat_created_at ON public.customer_account_transactions USING btree (created_at DESC);


--
-- Name: idx_cat_created_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cat_created_at_desc ON public.customer_account_transactions USING btree (created_at DESC);


--
-- Name: idx_cat_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cat_customer_id ON public.customer_account_transactions USING btree (customer_id);


--
-- Name: idx_customers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_name ON public.customers USING btree (name);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);


--
-- Name: idx_expenses_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_created_at ON public.expenses USING btree (created_at DESC);


--
-- Name: idx_products_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_barcode ON public.products USING btree (barcode);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category_id);


--
-- Name: idx_products_name_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_products_name_barcode ON public.products USING btree (name, barcode) WHERE (barcode IS NOT NULL);


--
-- Name: idx_products_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_supplier ON public.products USING btree (supplier_id);


--
-- Name: idx_purchase_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_items_product_id ON public.purchase_items USING btree (product_id);


--
-- Name: idx_purchase_items_purchase_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_items_purchase_id ON public.purchase_items USING btree (purchase_id);


--
-- Name: idx_purchases_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_created_at ON public.purchases USING btree (created_at DESC);


--
-- Name: idx_purchases_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_supplier_id ON public.purchases USING btree (supplier_id);


--
-- Name: idx_purchases_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchases_user_id ON public.purchases USING btree (user_id);


--
-- Name: idx_sale_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_product_id ON public.sale_items USING btree (product_id);


--
-- Name: idx_sale_items_sale_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_sale_id ON public.sale_items USING btree (sale_id);


--
-- Name: idx_sales_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_created_at ON public.sales USING btree (created_at DESC);


--
-- Name: idx_sales_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_customer_id ON public.sales USING btree (customer_id);


--
-- Name: idx_sales_invoice_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_invoice_number ON public.sales USING btree (invoice_number);


--
-- Name: idx_sales_return_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_return_items_product_id ON public.sales_return_items USING btree (product_id);


--
-- Name: idx_sales_return_items_return_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_return_items_return_id ON public.sales_return_items USING btree (return_id);


--
-- Name: idx_sales_returns_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_returns_created_at ON public.sales_returns USING btree (created_at DESC);


--
-- Name: idx_sales_returns_sale_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_returns_sale_id ON public.sales_returns USING btree (sale_id);


--
-- Name: idx_sales_returns_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_returns_user_id ON public.sales_returns USING btree (user_id);


--
-- Name: idx_sales_shift_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_shift_id ON public.sales USING btree (shift_id);


--
-- Name: idx_sales_terminal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_terminal ON public.sales USING btree (pos_terminal_id);


--
-- Name: idx_sat_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sat_created_at ON public.supplier_account_transactions USING btree (created_at DESC);


--
-- Name: idx_sat_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sat_created_by ON public.supplier_account_transactions USING btree (created_by);


--
-- Name: idx_sat_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sat_supplier_id ON public.supplier_account_transactions USING btree (supplier_id);


--
-- Name: idx_shifts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shifts_status ON public.shifts USING btree (status);


--
-- Name: idx_shifts_terminal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shifts_terminal ON public.shifts USING btree (pos_terminal_id);


--
-- Name: idx_shifts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shifts_user_id ON public.shifts USING btree (user_id);


--
-- Name: idx_stock_mv_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_mv_created ON public.product_stock_movements USING btree (created_at DESC);


--
-- Name: idx_stock_mv_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_mv_product ON public.product_stock_movements USING btree (product_id);


--
-- Name: idx_stock_mv_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_mv_ref ON public.product_stock_movements USING btree (reference_type, reference_id);


--
-- Name: idx_stock_mv_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_mv_type ON public.product_stock_movements USING btree (movement_type);


--
-- Name: idx_user_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_expires ON public.user_sessions USING btree (expires_at);


--
-- Name: idx_user_sessions_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_token ON public.user_sessions USING btree (refresh_token);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_users_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_active ON public.users USING btree (is_active);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: customer_account_transactions customer_account_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_account_transactions
    ADD CONSTRAINT customer_account_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: customer_account_transactions customer_account_transactions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_account_transactions
    ADD CONSTRAINT customer_account_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customers customers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: product_stock_movements product_stock_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock_movements
    ADD CONSTRAINT product_stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: product_stock_movements product_stock_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock_movements
    ADD CONSTRAINT product_stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: products products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: products products_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: purchase_items purchase_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: purchase_items purchase_items_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;


--
-- Name: purchases purchases_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: purchases purchases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: sale_items sale_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: sale_items sale_items_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: sales sales_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: sales sales_pos_terminal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pos_terminal_id_fkey FOREIGN KEY (pos_terminal_id) REFERENCES public.pos_terminals(id) ON DELETE SET NULL;


--
-- Name: sales_return_items sales_return_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_return_items
    ADD CONSTRAINT sales_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: sales_return_items sales_return_items_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_return_items
    ADD CONSTRAINT sales_return_items_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.sales_returns(id) ON DELETE CASCADE;


--
-- Name: sales_return_items sales_return_items_sale_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_return_items
    ADD CONSTRAINT sales_return_items_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES public.sale_items(id) ON DELETE SET NULL;


--
-- Name: sales_returns sales_returns_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_returns
    ADD CONSTRAINT sales_returns_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: sales_returns sales_returns_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_returns
    ADD CONSTRAINT sales_returns_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id);


--
-- Name: sales_returns sales_returns_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_returns
    ADD CONSTRAINT sales_returns_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;


--
-- Name: sales_returns sales_returns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_returns
    ADD CONSTRAINT sales_returns_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: sales sales_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;


--
-- Name: sales sales_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: settings settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: shifts shifts_pos_terminal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pos_terminal_id_fkey FOREIGN KEY (pos_terminal_id) REFERENCES public.pos_terminals(id);


--
-- Name: shifts shifts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: supplier_account_transactions supplier_account_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_account_transactions
    ADD CONSTRAINT supplier_account_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: supplier_account_transactions supplier_account_transactions_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_account_transactions
    ADD CONSTRAINT supplier_account_transactions_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: suppliers suppliers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict U4Zt3x0THBPGQIdBCqbi7ZjxgOgCdX1I3Zcvm9DUkGw9Rg9zkgeEcbELPjRDfXf

