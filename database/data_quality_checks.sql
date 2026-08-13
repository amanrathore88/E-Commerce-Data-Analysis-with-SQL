-- ============================================================================
-- Data Quality & Schema Audit Suite
-- E-Commerce Sales & Customer Analytics Project
--
-- This script contains queries to audit the database structure, primary keys,
-- referential integrity, value ranges, and duplicate records.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: ROW COUNTS AND KEY CARDINALITY
-- ----------------------------------------------------------------------------

-- Table record counts
SELECT 'customers' AS table_name, COUNT(*) AS row_count FROM customers
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items;

-- Key distinct counts
SELECT 
    COUNT(DISTINCT customer_id) AS distinct_customer_ids,
    COUNT(customer_name) AS total_customer_names,
    COUNT(DISTINCT customer_name) AS distinct_customer_names
FROM customers;


-- ----------------------------------------------------------------------------
-- SECTION 2: PRIMARY KEY & NULL INTEGRITY
-- ----------------------------------------------------------------------------

-- Check duplicate primary keys
SELECT customer_id, COUNT(*) FROM customers GROUP BY customer_id HAVING COUNT(*) > 1;
SELECT product_id, COUNT(*) FROM products GROUP BY product_id HAVING COUNT(*) > 1;
SELECT order_id, COUNT(*) FROM orders GROUP BY order_id HAVING COUNT(*) > 1;
SELECT order_item_id, COUNT(*) FROM order_items GROUP BY order_item_id HAVING COUNT(*) > 1;

-- Check unexpected NULLs in key fields
SELECT COUNT(*) AS null_customers FROM customers WHERE customer_id IS NULL OR customer_name IS NULL OR signup_date IS NULL;
SELECT COUNT(*) AS null_products FROM products WHERE product_id IS NULL OR product_name IS NULL OR unit_price IS NULL;
SELECT COUNT(*) AS null_orders FROM orders WHERE order_id IS NULL OR customer_id IS NULL OR order_date IS NULL OR order_status IS NULL;
SELECT COUNT(*) AS null_items FROM order_items WHERE order_item_id IS NULL OR order_id IS NULL OR product_id IS NULL OR quantity IS NULL OR unit_price IS NULL;


-- ----------------------------------------------------------------------------
-- SECTION 3: REFERENTIAL INTEGRITY & ORPHAN RECORDS
-- ----------------------------------------------------------------------------

-- Check for orphan orders (referential integrity check on orders -> customers)
SELECT COUNT(*) AS orphan_orders_count
FROM orders
WHERE customer_id NOT IN (SELECT customer_id FROM customers);

-- Check for orphan items (referential integrity check on order_items -> orders)
SELECT COUNT(*) AS orphan_order_items_count
FROM order_items
WHERE order_id NOT IN (SELECT order_id FROM orders);

-- Check for orphan items (referential integrity check on order_items -> products)
SELECT COUNT(*) AS orphan_products_count
FROM order_items
WHERE product_id NOT IN (SELECT product_id FROM products);


-- ----------------------------------------------------------------------------
-- SECTION 4: UNMATCHED BUSINESS ENTITIES
-- ----------------------------------------------------------------------------

-- Registered customers who have never placed an order (Never-Purchased)
SELECT COUNT(*) AS never_purchased_count
FROM customers
WHERE customer_id NOT IN (SELECT DISTINCT customer_id FROM orders);

-- Products that have never been purchased (if any)
SELECT COUNT(*) AS unsold_products_count
FROM products
WHERE product_id NOT IN (SELECT DISTINCT product_id FROM order_items);

-- Orders that contain zero items (if any)
SELECT COUNT(*) AS empty_orders_count
FROM orders
WHERE order_id NOT IN (SELECT DISTINCT order_id FROM order_items);


-- ----------------------------------------------------------------------------
-- SECTION 5: BUSINESS LOGIC & DUPLICATE IDENTIFICATION
-- ----------------------------------------------------------------------------

-- Duplicate customer profiles (different ID but identical attributes)
SELECT customer_name, city, gender, signup_date, COUNT(*) AS occurrences
FROM customers
GROUP BY customer_name, city, gender, signup_date
HAVING COUNT(*) > 1;

-- Duplicate business names with different IDs
SELECT customer_name, COUNT(DISTINCT customer_id) AS id_count, string_agg(customer_id::text, ', ') AS ids
FROM customers
GROUP BY customer_name
HAVING COUNT(DISTINCT customer_id) > 1;

-- Duplicate product definitions (different ID but identical attributes)
SELECT product_name, category, unit_price, COUNT(*) AS occurrences
FROM products
GROUP BY product_name, category, unit_price
HAVING COUNT(*) > 1;


-- ----------------------------------------------------------------------------
-- SECTION 6: VALUE BOUNDS AND RANGE AUDITING
-- ----------------------------------------------------------------------------

-- Check date bounds
SELECT MIN(signup_date) AS min_signup, MAX(signup_date) AS max_signup FROM customers;
SELECT MIN(order_date) AS min_order, MAX(order_date) AS max_order FROM orders;

-- Check gender categorical constraints
SELECT gender, COUNT(*) FROM customers GROUP BY gender;

-- Check order status categorical constraints
SELECT order_status, COUNT(*) FROM orders GROUP BY order_status;

-- Check category distributions
SELECT category, COUNT(*) FROM products GROUP BY category;

-- Check invalid price/quantity inputs
SELECT COUNT(*) AS invalid_quantities FROM order_items WHERE quantity <= 0;
SELECT COUNT(*) AS invalid_product_prices FROM products WHERE unit_price <= 0;
SELECT COUNT(*) AS invalid_item_prices FROM order_items WHERE unit_price <= 0;


-- ----------------------------------------------------------------------------
-- SECTION 7: RECONCILIATION AUDIT
-- ----------------------------------------------------------------------------

-- Check price consistency (mismatches between order item unit price and product catalog price)
SELECT 
    oi.order_id, 
    oi.product_id, 
    p.product_name, 
    oi.unit_price AS sales_unit_price, 
    p.unit_price AS catalog_unit_price,
    (oi.unit_price - p.unit_price) AS price_diff
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
WHERE oi.unit_price <> p.unit_price;
