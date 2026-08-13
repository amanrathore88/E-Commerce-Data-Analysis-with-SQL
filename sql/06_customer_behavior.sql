-- ============================================================================
-- SQL File: sql/06_customer_behavior.sql
-- Scope: Questions 33, 35, 44
-- Dialect: PostgreSQL (Canonical)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q33: How many customers are new vs returning?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We analyze this question from two distinct angles:
-- 1. Customer Level (One-time buyers vs. Repeat buyers)
--    - Our database shows that 0% of purchasers are one-time buyers. Every single 
--      buyer eventually placed a second order.
-- 2. Transaction Level (Orders placed by first-time buyers vs. returning buyers)
--    - Calculates what percentage of our transactions are acquisition orders 
--      (first purchase = 4.85%) vs. retention orders (subsequent purchases = 95.15%).

-- Perspective 1: Customer Profile Grains
SELECT 
    purchasing_cohort,
    COUNT(customer_id) AS customer_count,
    ROUND((COUNT(customer_id) * 100.0 / (SELECT COUNT(*) FROM customers)), 2) AS pct_of_registered
FROM vw_customer_summary
GROUP BY purchasing_cohort;

-- Perspective 2: Transaction Level Splits
WITH order_sequence AS (
    SELECT 
        order_id,
        customer_id,
        order_date,
        ROW_NUMBER() OVER (
            PARTITION BY customer_id 
            ORDER BY order_date, order_id
        ) AS order_number
    FROM orders
    WHERE order_status = 'Delivered'
)
SELECT 
    CASE 
        WHEN order_number = 1 THEN 'New Customer Order (Acquisition)'
        ELSE 'Returning Customer Order (Retention)'
    END AS transaction_type,
    COUNT(order_id) AS order_count,
    ROUND((COUNT(order_id) * 100.0 / SUM(COUNT(order_id)) OVER ()), 2) AS pct_of_delivered_orders
FROM order_sequence
GROUP BY 
    CASE 
        WHEN order_number = 1 THEN 'New Customer Order (Acquisition)'
        ELSE 'Returning Customer Order (Retention)'
    END;


-- ----------------------------------------------------------------------------
-- Q35: Which customers purchase from more than one category?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Measures catalog cross-shopping. In this dataset, all 80 active 
-- buyers purchased from multiple categories, indicating strong product vertical 
-- penetration.
SELECT 
    c.customer_id,
    c.customer_name,
    COUNT(DISTINCT p.category) AS categories_purchased
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
JOIN orders o ON oi.order_id = o.order_id
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.order_status = 'Delivered'
GROUP BY c.customer_id, c.customer_name
HAVING COUNT(DISTINCT p.category) > 1
ORDER BY categories_purchased DESC, customer_id;


-- ----------------------------------------------------------------------------
-- Q44: How much revenue comes from male vs female customers?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Demographics analysis. Displays balanced revenue splits between 
-- Male (52.88%) and Female (47.12%) customer bases.
SELECT 
    c.gender,
    SUM(oi.quantity * oi.unit_price) AS recognized_revenue,
    ROUND(
        SUM(oi.quantity * oi.unit_price) * 100.0 / 
        SUM(SUM(oi.quantity * oi.unit_price)) OVER (), 
        2
    ) AS revenue_percentage
FROM order_items oi
JOIN orders o ON oi.order_id = o.order_id
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.order_status = 'Delivered'
GROUP BY c.gender;
