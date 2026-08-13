-- ============================================================================
-- SQL File: sql/02_product_category_analysis.sql
-- Scope: Questions 14, 15, 16, 17, 22, 28, 42, 48, 49, 52
-- Dialect: PostgreSQL (Canonical)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q14: What is the best-selling category? (by quantity sold)
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Ranked by physical units sold (quantity). Electronics is the 
-- clear volume driver (3,450 units in Delivered orders).
SELECT 
    p.category,
    SUM(oi.quantity) AS total_units_sold
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status = 'Delivered'
GROUP BY p.category
ORDER BY total_units_sold DESC
LIMIT 1;


-- ----------------------------------------------------------------------------
-- Q15: Which product generates the highest revenue?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: The Smartphone X12 generates 7,219,620.00 in recognized revenue, 
-- making it our single largest revenue driver (22.37% of total company sales).
SELECT 
    p.product_id,
    p.product_name,
    SUM(oi.quantity * oi.unit_price) AS product_revenue
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status = 'Delivered'
GROUP BY p.product_id, p.product_name
ORDER BY product_revenue DESC
LIMIT 1;


-- ----------------------------------------------------------------------------
-- Q16: Which product generates the lowest revenue?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Self-Help Bestseller generates our lowest recognized revenue 
-- (83,062.00). This indicates it should be reviewed for potential retirement, 
-- unless it operates as a high-margin or low-storage-cost item.
SELECT 
    p.product_id,
    p.product_name,
    SUM(oi.quantity * oi.unit_price) AS product_revenue
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status = 'Delivered'
GROUP BY p.product_id, p.product_name
ORDER BY product_revenue ASC
LIMIT 1;


-- ----------------------------------------------------------------------------
-- Q17: On average, how many products are bought per order?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: There is an ambiguity between unique SKUs and total unit quantities. 
-- We calculate both to cover distinct operational logistics concepts:
-- 1. Average Unique SKUs (line items) per order = 2.48
--    - Represents the number of distinct storage bins/shelves a warehouse picker 
--      must visit to fulfill an order.
-- 2. Average Total Units (quantity) per order = 7.42
--    - Represents the actual physical volume of items packed into the shipping container, 
--      dictating packaging size, parcel weight, and shipping costs.
SELECT 
    COUNT(product_id) * 1.0 / COUNT(DISTINCT order_id) AS avg_unique_skus_per_order,
    SUM(quantity) * 1.0 / COUNT(DISTINCT order_id) AS avg_total_units_per_order
FROM order_items;


-- ----------------------------------------------------------------------------
-- Q22: What is the top-selling product in each category? (by quantity)
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We use ROW_NUMBER() partitioned by category to identify the volume 
-- leader in each category. Ties are resolved by sorting descending, selecting rank = 1.
WITH category_sales AS (
    SELECT 
        p.category,
        p.product_name,
        SUM(oi.quantity) AS total_quantity,
        ROW_NUMBER() OVER (PARTITION BY p.category ORDER BY SUM(oi.quantity) DESC) AS rank_in_cat
    FROM order_items oi
    JOIN products p ON oi.product_id = p.product_id
    JOIN orders o ON oi.order_id = o.order_id
    WHERE o.order_status = 'Delivered'
    GROUP BY p.category, p.product_name
)
SELECT category, product_name, total_quantity AS units_sold
FROM category_sales
WHERE rank_in_cat = 1;


-- ----------------------------------------------------------------------------
-- Q28: What percentage does each product contribute to total revenue?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Displays sales concentration at the SKU level. We use a window 
-- sum `SUM() OVER ()` in the denominator to avoid an explicit self-cross-join.
SELECT 
    product_name,
    total_recognized_revenue,
    ROUND((total_recognized_revenue * 100.0 / SUM(total_recognized_revenue) OVER ()), 4) AS percentage_contribution
FROM vw_product_summary
ORDER BY percentage_contribution DESC;


-- ----------------------------------------------------------------------------
-- Q42: What are the top 10 best-selling products? (by quantity)
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Identifies our primary volume-replenishment list. Led by 
-- Badminton Rackets (388) and Smartphone X12 (380).
SELECT 
    product_name,
    total_units_sold
FROM vw_product_summary
ORDER BY total_units_sold DESC
LIMIT 10;


-- ----------------------------------------------------------------------------
-- Q48: What is the worst-selling category? (by revenue)
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Books generates our lowest category revenue at 470,646.00. 
-- Even though we sold 991 books (moderate volume), their low ASP (349.00 - 599.00) 
-- places the category at the bottom of the revenue list.
SELECT 
    p.category,
    SUM(oi.quantity * oi.unit_price) AS category_revenue
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status = 'Delivered'
GROUP BY p.category
ORDER BY category_revenue ASC
LIMIT 1;


-- ----------------------------------------------------------------------------
-- Q49: What is the most expensive product sold?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: The Smartphone X12 (18,999.00) is our most expensive SKU sold.
SELECT DISTINCT 
    p.product_name,
    p.unit_price,
    p.category
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status = 'Delivered'
ORDER BY p.unit_price DESC
LIMIT 1;


-- ----------------------------------------------------------------------------
-- Q52: What percentage does each category contribute to total revenue?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: Highlight category concentration. Electronics represents 63.43% 
-- of total revenue, indicating heavy reliance on a single product segment.
SELECT 
    p.category,
    SUM(oi.quantity * oi.unit_price) AS category_revenue,
    ROUND(
        SUM(oi.quantity * oi.unit_price) * 100.0 / 
        SUM(SUM(oi.quantity * oi.unit_price)) OVER (), 
        2
    ) AS percentage_contribution
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status = 'Delivered'
GROUP BY p.category
ORDER BY percentage_contribution DESC;
