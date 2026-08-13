-- ============================================================================
-- SQL File: sql/09_product_affinity.sql
-- Scope: Question 36
-- Dialect: PostgreSQL (Canonical)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q36: Which two products are most frequently purchased together?
-- ----------------------------------------------------------------------------
-- ANALYST NOTE: We use a self-join on order_items at the order grain, filtered 
-- to Delivered transactions. The join condition `oi1.product_id < oi2.product_id` 
-- is critical:
-- 1. Prevents a product pairing with itself (Product A + Product A).
-- 2. Eliminates duplicate permutations (e.g. counting (A,B) and (B,A) separately), 
--    enforcing undirected pair symmetry.
SELECT 
    oi1.product_id AS p1_id, 
    p1.product_name AS p1_name,
    oi2.product_id AS p2_id, 
    p2.product_name AS p2_name,
    COUNT(DISTINCT oi1.order_id) AS co_occurrence_count
FROM order_items oi1
JOIN order_items oi2 ON oi1.order_id = oi2.order_id AND oi1.product_id < oi2.product_id
JOIN products p1 ON oi1.product_id = p1.product_id
JOIN products p2 ON oi2.product_id = p2.product_id
JOIN orders o ON oi1.order_id = o.order_id
WHERE o.order_status = 'Delivered'
GROUP BY oi1.product_id, p1.product_name, oi2.product_id, p2.product_name
ORDER BY co_occurrence_count DESC
LIMIT 5;
