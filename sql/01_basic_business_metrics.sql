-- ============================================================================
-- SQL File: sql/01_basic_business_metrics.sql
-- Scope: Questions 1 through 10
-- Dialect: PostgreSQL (Canonical)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q01: What is our total revenue so far?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Recognized revenue must be defined strictly using 'Delivered' 
-- status. Including cancelled orders would inflate our figures by 5.21M (12.7%), 
-- distorting cash-flow and tax planning.
SELECT SUM(quantity * unit_price) AS total_recognized_revenue
FROM order_items oi
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status = 'Delivered';

-- RECONCILIATION & GRAIN: 
-- This query operates at the order-item grain. To reconcile, we can pre-aggregate 
-- to the order grain first. Below is the alternative, showing that both grains 
-- yield the identical result (32,280,641.00) because there are no orphan items:
WITH order_grain_totals AS (
    SELECT order_id, SUM(quantity * unit_price) AS order_value
    FROM order_items
    GROUP BY order_id
)
SELECT SUM(ogt.order_value) AS total_revenue
FROM orders o
JOIN order_grain_totals ogt ON o.order_id = ogt.order_id
WHERE o.order_status = 'Delivered';


-- ----------------------------------------------------------------------------
-- Q02: How many total orders have we received?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Counts all transactions in the pipeline (Delivered, Pending, Cancelled).
-- If we need to count from order_items, we must use COUNT(DISTINCT order_id) because
-- joining order_items multiplies order headers (O(N) items per order).
SELECT COUNT(order_id) AS total_orders_placed
FROM orders;


-- ----------------------------------------------------------------------------
-- Q03: How many total customers do we have?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Measures total registered base (90). Note that this is not 
-- equivalent to buying customers (80) or active customers.
SELECT COUNT(customer_id) AS total_registered_customers
FROM customers;


-- ----------------------------------------------------------------------------
-- Q04: How many total products do we sell?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We compare the count of unique SKUs in our catalog against those 
-- that have actually recorded a sale in order_items. In this dataset, all 38 
-- catalog SKUs have active sales, indicating a lean, fully utilized catalog.
SELECT 
    (SELECT COUNT(*) FROM products) AS total_catalog_products,
    (SELECT COUNT(DISTINCT product_id) FROM order_items) AS active_sold_products;


-- ----------------------------------------------------------------------------
-- Q05: What is the average amount a customer spends per order? (AOV)
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: AOV is calculated as recognized revenue divided by unique delivered orders. 
-- Standard division without status filters would inflate the denominator with cancelled 
-- orders and deflate the average.
SELECT SUM(quantity * unit_price) / COUNT(DISTINCT o.order_id) AS average_order_value
FROM order_items oi
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status = 'Delivered';

-- Alternative: Querying our pre-aggregated order view, which abstracts the item-to-header join:
SELECT AVG(recognized_revenue) AS average_order_value
FROM vw_order_summary
WHERE order_status = 'Delivered';


-- ----------------------------------------------------------------------------
-- Q06: What are the top 5 best-selling products? (by quantity)
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Ranked strictly by physical units sold. This identifies volume drivers 
-- (like Badminton Rackets: 388 units), which dictate warehousing space, whereas high-ASP 
-- items (like Smartphone X12: 380 units) drive revenue.
SELECT 
    p.product_id,
    p.product_name,
    p.category,
    SUM(oi.quantity) AS total_units_sold
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status = 'Delivered'
GROUP BY p.product_id, p.product_name, p.category
ORDER BY total_units_sold DESC
LIMIT 5;


-- ----------------------------------------------------------------------------
-- Q07: Which category is generating the most revenue?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Evaluates category sales concentration. Electronics dominates 
-- recognized revenue at 20.47M.
SELECT 
    p.category,
    SUM(oi.quantity * oi.unit_price) AS category_revenue
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status = 'Delivered'
GROUP BY p.category
ORDER BY category_revenue DESC
LIMIT 1;


-- ----------------------------------------------------------------------------
-- Q08: Who are our top 5 most valuable customers?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We must group by customer_id rather than customer_name because 
-- names are not unique (e.g. two distinct customer profiles named 'Neha Sharma').
SELECT 
    c.customer_id,
    c.customer_name,
    c.city,
    SUM(oi.quantity * oi.unit_price) AS total_recognized_spend
FROM order_items oi
JOIN orders o ON oi.order_id = o.order_id
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.order_status = 'Delivered'
GROUP BY c.customer_id, c.customer_name, c.city
ORDER BY total_recognized_spend DESC
LIMIT 5;


-- ----------------------------------------------------------------------------
-- Q09: How has our revenue trended month by month?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Monthly recognized revenue trend. Displays scaling from ~650k in 
-- Jan 2025 to over 4.15M in July 2026.
SELECT 
    TO_CHAR(o.order_date, 'YYYY-MM') AS order_month,
    SUM(oi.quantity * oi.unit_price) AS monthly_revenue,
    COUNT(DISTINCT o.order_id) AS monthly_order_count
FROM order_items oi
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status = 'Delivered'
GROUP BY TO_CHAR(o.order_date, 'YYYY-MM')
ORDER BY order_month;


-- ----------------------------------------------------------------------------
-- Q10: Which city is generating the most sales?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Geographic revenue distribution. Mumbai leads with 5.18M, 
-- indicating it should be our primary fulfillment hub.
SELECT 
    c.city,
    SUM(oi.quantity * oi.unit_price) AS total_sales
FROM order_items oi
JOIN orders o ON oi.order_id = o.order_id
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.order_status = 'Delivered'
GROUP BY c.city
ORDER BY total_sales DESC
LIMIT 1;
