# Analytical SQL Techniques & Application Notes

This reference details the advanced SQL patterns implemented across this project. It focuses on the engineering rationale and how these shapes mitigate specific query and data model risks.

---

## 1. Grain Management & CTEs
In our e-commerce schema, joining the `orders` header table (order grain) directly to the `order_items` line-item table (item grain) repeats the order header attributes for every item in that order. Running an aggregation (like `AVG` or `SUM`) on order totals after a direct join would lead to **row multiplication and metric inflation**.

To solve this, we use Common Table Expressions (CTEs) to pre-aggregate line items to the order grain *before* joining them to customer profiles or other dimensions. This isolates intermediate calculations and protects our denominators:

```sql
-- Pattern for grain isolation (Pre-aggregating items to order grain)
WITH order_grain_totals AS (
    SELECT order_id, SUM(quantity * unit_price) AS order_value
    FROM order_items
    GROUP BY order_id
)
SELECT AVG(ogt.order_value) AS average_order_spend
FROM orders o
JOIN order_grain_totals ogt ON o.order_id = ogt.order_id
WHERE o.order_status = 'Delivered';
```

---

## 2. Window Functions & Partitioning
Window functions execute calculations across a set of table rows related to the current row, but unlike standard GROUP BY aggregates, they do not collapse rows into a single output. This allows us to retain line-item details while applying cumulative or offset calculations.

### A. DENSE_RANK() vs. ROW_NUMBER()
- **`DENSE_RANK()`**: We use `DENSE_RANK()` for VIP rankings and product popularity because it handles ties without skipping rank numbers (e.g., if two customers spend the exact same amount, they both receive Rank 1, and the next highest spender receives Rank 2).
- **`ROW_NUMBER()`**: We use `ROW_NUMBER()` inside partitions to select exactly one record per group (such as selecting the single best-selling SKU per category), ensuring a clean deduplicated output even in the event of numerical ties.

### B. Daily Cumulative Accumulation
To calculate daily running revenue totals efficiently, we first aggregate realized sales to the day grain in a CTE, then apply `SUM() OVER (ORDER BY order_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`. This reduces the window function's sorting workload from O(N) line items to O(D) unique days.

---

## 3. Temporal Anchoring for Long-Term Reproducibility
Using standard functions like `CURRENT_DATE` or `NOW()` is a common pitfall in portfolio projects based on static historical datasets. Because transactions in this dataset stop on `2026-07-25`, using `CURRENT_DATE` would show all customers as inactive for thousands of days, rendering recency, inactivity, and churn reports permanently empty.

We resolve this by dynamically establishing a temporal anchor in a CTE:
```sql
WITH anchor AS (
    SELECT MAX(order_date) AS analysis_date FROM orders
)
SELECT 
    customer_id,
    last_order_date,
    ((SELECT analysis_date FROM anchor) - last_order_date) AS days_since_last_order
FROM vw_customer_summary;
```
This guarantees that all inactivity metrics remain correct and reproducible regardless of when the queries are run.

---

## 4. Self-Joins for Symmetric Basket Co-Occurrence
To extract the two products most frequently bought together, we perform an inner self-join on `order_items` matching on `order_id`. Joining a table on itself introduces two critical mathematical risks:
1. **Self-pairing**: A product pairing with itself (e.g., SKU 1 bought with SKU 1).
2. **Duplicate permutations**: Counting both `(Product A, Product B)` and `(Product B, Product A)`, which double-counts occurrences.

We eliminate both risks by applying the inequality join condition `oi1.product_id < oi2.product_id`. This restricts the output to unique, sorted, undirected pairs, ensuring basket co-occurrence counts are symmetric and accurate:

```sql
SELECT 
    oi1.product_id AS p1_id, 
    oi2.product_id AS p2_id,
    COUNT(DISTINCT oi1.order_id) AS co_occurrence_count
FROM order_items oi1
JOIN order_items oi2 ON oi1.order_id = oi2.order_id AND oi1.product_id < oi2.product_id
GROUP BY oi1.product_id, oi2.product_id;
```
