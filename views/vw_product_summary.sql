-- ============================================================================
-- View: vw_product_summary (PostgreSQL Version)
-- Grain: Product Level (one row per product_id)
-- Purpose: Tracks sales rankings, unit volume, and revenue contribution.
-- ============================================================================
CREATE OR REPLACE VIEW vw_product_summary AS
WITH product_sales AS (
    SELECT 
        oi.product_id,
        COALESCE(SUM(oi.quantity), 0) AS total_units_sold,
        COUNT(DISTINCT oi.order_id) AS total_orders,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0.00) AS total_recognized_revenue,
        AVG(oi.quantity) AS average_units_per_order
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.order_id
    WHERE o.order_status = 'Delivered'
    GROUP BY oi.product_id
),
overall_revenue AS (
    SELECT SUM(total_recognized_revenue) AS grand_total_revenue
    FROM product_sales
)
SELECT 
    p.product_id,
    p.product_name,
    p.category,
    p.unit_price AS catalog_unit_price,
    COALESCE(ps.total_units_sold, 0) AS total_units_sold,
    COALESCE(ps.total_orders, 0) AS total_orders_count,
    COALESCE(ps.total_recognized_revenue, 0.00) AS total_recognized_revenue,
    COALESCE(ps.average_units_per_order, 0.00) AS average_units_per_order,
    CASE 
        WHEN (SELECT grand_total_revenue FROM overall_revenue) > 0 
        THEN ROUND((COALESCE(ps.total_recognized_revenue, 0.00) * 100.0 / (SELECT grand_total_revenue FROM overall_revenue)), 4)
        ELSE 0.0000
    END AS revenue_contribution_pct,
    DENSE_RANK() OVER (ORDER BY COALESCE(ps.total_recognized_revenue, 0.00) DESC) AS revenue_rank,
    DENSE_RANK() OVER (ORDER BY COALESCE(ps.total_units_sold, 0) DESC) AS quantity_sold_rank
FROM products p
LEFT JOIN product_sales ps ON p.product_id = ps.product_id;
