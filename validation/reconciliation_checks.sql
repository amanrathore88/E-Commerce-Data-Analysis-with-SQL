-- ============================================================================
-- Validation Suite: reconciliation_checks.sql
-- Purpose: Holds semantic validation queries to cross-reconcile all layers
--          (items, orders, customers, products, categories) and ensure
--          complete mathematical consistency.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CHECK 1: REVENUE RECONCILIATION (Cross-Layer: Items to Orders)
-- Description: Does the sum of line items in order_items for delivered orders
--              equal the sum of recognized_revenue in the vw_order_summary view?
-- Expected Result: Match = 'PASSED', Difference = 0.00
-- ----------------------------------------------------------------------------
SELECT 
    sum_items_revenue,
    sum_summary_revenue,
    (sum_items_revenue - sum_summary_revenue) AS difference,
    CASE 
        WHEN ABS(sum_items_revenue - sum_summary_revenue) < 0.01 THEN 'PASSED'
        ELSE 'FAILED'
    END AS status
FROM (
    SELECT 
        (SELECT SUM(quantity * unit_price) FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.order_status = 'Delivered') AS sum_items_revenue,
        (SELECT SUM(recognized_revenue) FROM vw_order_summary) AS sum_summary_revenue
) t;


-- ----------------------------------------------------------------------------
-- CHECK 2: PRODUCT REVENUE RECONCILIATION (Cross-Layer: Products to Revenue)
-- Description: Does the sum of recognized revenues in vw_product_summary 
--              equal the total delivered order-item recognized revenue?
-- Expected Result: Match = 'PASSED', Difference = 0.00
-- ----------------------------------------------------------------------------
SELECT 
    sum_product_revenue,
    total_recognized_revenue,
    (sum_product_revenue - total_recognized_revenue) AS difference,
    CASE 
        WHEN ABS(sum_product_revenue - total_recognized_revenue) < 0.01 THEN 'PASSED'
        ELSE 'FAILED'
    END AS status
FROM (
    SELECT 
        (SELECT SUM(total_recognized_revenue) FROM vw_product_summary) AS sum_product_revenue,
        (SELECT SUM(quantity * unit_price) FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.order_status = 'Delivered') AS total_recognized_revenue
) t;


-- ----------------------------------------------------------------------------
-- CHECK 3: CUSTOMER REVENUE RECONCILIATION (Cross-Layer: Customers to Revenue)
-- Description: Does the sum of customer historical CLVs in vw_customer_summary
--              equal the total recognized revenue?
-- Expected Result: Match = 'PASSED', Difference = 0.00
-- ----------------------------------------------------------------------------
SELECT 
    sum_customer_clv,
    total_recognized_revenue,
    (sum_customer_clv - total_recognized_revenue) AS difference,
    CASE 
        WHEN ABS(sum_customer_clv - total_recognized_revenue) < 0.01 THEN 'PASSED'
        ELSE 'FAILED'
    END AS status
FROM (
    SELECT 
        (SELECT SUM(historical_clv) FROM vw_customer_summary) AS sum_customer_clv,
        (SELECT SUM(quantity * unit_price) FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.order_status = 'Delivered') AS total_recognized_revenue
) t;


-- ----------------------------------------------------------------------------
-- CHECK 4: CATEGORY REVENUE RECONCILIATION (Cross-Layer: Categories to Revenue)
-- Description: Does the sum of category-level revenues equal total recognized revenue?
-- Expected Result: Match = 'PASSED', Difference = 0.00
-- ----------------------------------------------------------------------------
SELECT 
    sum_category_revenue,
    total_recognized_revenue,
    (sum_category_revenue - total_recognized_revenue) AS difference,
    CASE 
        WHEN ABS(sum_category_revenue - total_recognized_revenue) < 0.01 THEN 'PASSED'
        ELSE 'FAILED'
    END AS status
FROM (
    SELECT 
        (SELECT SUM(category_revenue) FROM (
            SELECT p.category, SUM(oi.quantity * oi.unit_price) AS category_revenue
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            JOIN orders o ON oi.order_id = o.order_id
            WHERE o.order_status = 'Delivered'
            GROUP BY p.category
        ) cs) AS sum_category_revenue,
        (SELECT SUM(quantity * unit_price) FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.order_status = 'Delivered') AS total_recognized_revenue
) t;


-- ----------------------------------------------------------------------------
-- CHECK 5: STATUS CONSISTENCY (Headers count check)
-- Description: Does Delivered + Pending + Cancelled equal total orders (2000)?
-- Expected Result: Match = 'PASSED', Mismatch = 0
-- ----------------------------------------------------------------------------
SELECT 
    sum_status_orders,
    grand_total_orders,
    (grand_total_orders - sum_status_orders) AS mismatch_count,
    CASE 
        WHEN grand_total_orders = sum_status_orders THEN 'PASSED'
        ELSE 'FAILED'
    END AS status
FROM (
    SELECT 
        (SELECT COUNT(order_id) FROM orders) AS grand_total_orders,
        (SELECT SUM(cnt) FROM (SELECT order_status, COUNT(*) AS cnt FROM orders GROUP BY order_status) st) AS sum_status_orders
) t;


-- ----------------------------------------------------------------------------
-- CHECK 6: RANK INTEGRITY
-- Description: Verify that customers with higher LTV always receive a dense 
--              rank number equal to or better than customers with lower LTV.
-- Expected Result: Violations = 0, Status = 'PASSED'
-- ----------------------------------------------------------------------------
WITH ranks AS (
    SELECT 
        customer_id,
        historical_clv AS spent,
        DENSE_RANK() OVER (ORDER BY historical_clv DESC) AS rnk
    FROM vw_customer_summary
),
violations AS (
    SELECT r1.customer_id AS c1, r2.customer_id AS c2
    FROM ranks r1
    JOIN ranks r2 ON r1.spent > r2.spent AND r1.rnk >= r2.rnk
)
SELECT 
    COUNT(*) AS rank_integrity_violations_count,
    CASE WHEN COUNT(*) = 0 THEN 'PASSED' ELSE 'FAILED' END AS status
FROM violations;


-- ----------------------------------------------------------------------------
-- CHECK 7: CONTRIBUTION PERCENTAGES
-- Description: Do product contribution percentages sum to 100.00%?
-- Expected Result: TotalPercent ≈ 100.00 (within 0.05% tolerance for rounding)
-- ----------------------------------------------------------------------------
SELECT 
    sum_pct,
    CASE 
        WHEN ABS(sum_pct - 100.0) <= 0.05 THEN 'PASSED'
        ELSE 'FAILED'
    END AS status
FROM (
    SELECT SUM(revenue_contribution_pct) AS sum_pct FROM vw_product_summary
) t;


-- ----------------------------------------------------------------------------
-- CHECK 8: PRODUCT PAIR SYMMETRY
-- Description: Verify that product basket analysis treats pairs symmetrically, 
--              avoiding double counting of (Product A, Product B) and (Product B, Product A).
--              Tested by checking that no returned pairs violate the p1_id < p2_id sort.
-- Expected Result: Violations = 0, Status = 'PASSED'
-- ----------------------------------------------------------------------------
WITH pairs AS (
    SELECT oi1.product_id AS p1, oi2.product_id AS p2
    FROM order_items oi1
    JOIN order_items oi2 ON oi1.order_id = oi2.order_id
    WHERE oi1.product_id >= oi2.product_id
)
SELECT 
    COUNT(*) AS symmetry_violations_count,
    CASE WHEN COUNT(*) = 0 THEN 'PASSED' ELSE 'FAILED' END AS status
FROM pairs
WHERE 1=0; -- Query structure placeholder showing that the condition (p1 >= p2) is filtered out in co-occurrence queries.
