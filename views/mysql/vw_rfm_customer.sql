-- ============================================================================
-- View: vw_rfm_customer (MySQL Version)
-- Grain: Customer Level (one row per active buying customer)
-- Purpose: Computes RFM segmentations using CONCAT for string codes.
-- ============================================================================
CREATE OR REPLACE VIEW vw_rfm_customer AS
WITH rfm_base AS (
    SELECT 
        customer_id,
        customer_name,
        city,
        gender,
        days_since_last_order AS recency,
        delivered_orders AS frequency,
        historical_clv AS monetary
    FROM vw_customer_summary
    WHERE total_orders > 0
),
rfm_scores AS (
    SELECT 
        customer_id,
        customer_name,
        city,
        gender,
        recency,
        frequency,
        monetary,
        6 - NTILE(5) OVER (ORDER BY recency ASC) AS r_score,
        NTILE(5) OVER (ORDER BY frequency ASC) AS f_score,
        NTILE(5) OVER (ORDER BY monetary ASC) AS m_score
    FROM rfm_base
)
SELECT 
    customer_id,
    customer_name,
    city,
    gender,
    recency,
    frequency,
    monetary,
    r_score,
    f_score,
    m_score,
    CONCAT(r_score, f_score, m_score) AS rfm_code,
    CASE
        WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'Champions'
        WHEN r_score >= 3 AND f_score >= 3 AND m_score >= 3 THEN 'Loyal Customers'
        WHEN r_score >= 4 AND f_score = 1 THEN 'New Customers'
        WHEN r_score <= 2 AND f_score >= 3 AND m_score >= 3 THEN 'At Risk'
        WHEN r_score <= 2 AND f_score <= 2 AND m_score <= 2 THEN 'Hibernating'
        WHEN r_score >= 3 AND f_score >= 2 THEN 'Potential Loyalists'
        ELSE 'About to Sleep'
    END AS customer_segment
FROM rfm_scores;
