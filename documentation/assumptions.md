# Analytical Assumptions & Constraints

This document logs the core assumptions and boundaries established for the e-commerce database analysis. It outlines the rationale behind specific logical choices.

---

## 1. Recognized Revenue Definition

- **Assumption**: Recognized revenue is based strictly on orders with `order_status = 'Delivered'`.
- **Alternative**: Gross Booking Value (GBV) includes all orders (including pending and cancelled transactions), which totals **39,553,815.00**.
- **Rationale**:
  - Cancelled orders represent failed transactions and total **5,213,749.00** (12.7%). Including them would inflate revenue and skew AOV calculations.
  - Pending orders represent pipeline transactions that have not yet been completed. They are isolated from recognized revenue until fulfillment confirmation.
  - In our validation phase, we confirmed that all category and product-level summaries reconcile to this delivered baseline of **32,280,641.00**.

---

## 2. Centralized Analytical Anchor Date

- **Assumption**: The "current date" baseline for all recency, inactivity, and churn calculations is derived dynamically as `MAX(order_date)` from the `orders` table.
- **Rationale**:
  - In this dataset, the latest order date evaluates to **2026-07-25**.
  - If standard functions like `CURRENT_DATE` or `NOW()` were used, running this query in the future would result in all customers showing thousands of days of inactivity, producing empty output tables.
  - Using a dynamic CTE or subquery anchor ensures the queries remain reproducible.

---

## 3. Customer Base & Churn Taxonomy

- **Assumption**: Customers who have never placed an order ($N=10$) are isolated from the churn cohort.
- **Rationale**:
  - A user who has signed up but never made a transaction represents a **marketing activation/onboarding failure**.
  - A user who has made a purchase but stopped buying represents a **retention/churn failure**.
  - Combining these groups would distort the churn rate, making it look like a retention issue rather than a funnel problem.
  - We calculate churn rate strictly on the active purchasing cohort ($N=80$) using a 90-day inactivity threshold (last purchase date before `2026-04-26`), resulting in an **analytical churn rate of 10.0%** (8 customers).

---

## 4. Churn-Risk Baseline

- **Assumption**: Churn risk is flagged when a customer has no orders for more than 120 days (last purchase date before `2026-03-27`).
- **Rationale**:
  - Since the average days between orders in this cohort is **15.87 days**, a customer who has missed ~7 average cycles (120 days) represents a severe risk of permanent attrition.
  - At this threshold, 5 customers are flagged as churn risks. These are prioritized for win-back campaigns.

---

## 5. Missing Product Cost & Profitability

- **Assumption**: Product cost (COGS), shipping charges, and marketing acquisition costs are unavailable.
- **Rationale**:
  - The database does not contain a cost field.
  - Consequently, we do not calculate margin, profit, or profitability in the product view or dashboard.
  - Any discussion of margins is documented strictly as a limitation and future enhancement.

---

## 6. Order Header vs. Item Joins (Double-Counting Risk)

- **Assumption**: Joining `orders` to `order_items` multiplies order-level records, necessitating careful aggregation.
- **Rationale**:
  - An order with 3 items will repeat the order header 3 times in a raw join.
  - To prevent double-counting of order counts and overall AOV, aggregation must occur either before joining or by utilizing `COUNT(DISTINCT order_id)`.
  - In our validation suite, we implemented checks to ensure that order count checks match header totals.
