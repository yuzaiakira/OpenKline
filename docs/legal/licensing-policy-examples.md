# Proposed source-available policy examples

Status: **Illustrative only.** These examples explain the proposed policy in
[`openkline-source-available-license-proposal.md`](./openkline-source-available-license-proposal.md);
they are not a legal opinion, exception, or substitute for the final adopted
license and qualified-counsel review.

## Examples that fit the proposed conditions

| Scenario | Why it fits, subject to counsel confirmation |
| --- | --- |
| An individual publishes a free browser chart application. The complete client and required server source, deployment templates, and build instructions are public; there are no ads, paid tiers, or affiliate links. | The application is free, source is publicly available, and no prohibited monetization appears. |
| A company operates a free dashboard using OpenKline while earning revenue from an unrelated manufacturing business. The dashboard's complete required source is public and it has no ads, subscriptions, premium capacity, or paid promotions. | Unrelated company revenue alone does not disqualify a qualifying Consumer Application. |
| A community project accepts an optional donation button. Donors receive no feature, badge, priority, higher quota, support entitlement, early access, or other benefit. | The payment is a Voluntary Donation rather than a Paid Feature or Subscription Access. |
| A maintainer forks OpenKline, publishes the modified source, retains notices, identifies the modifications, and uses it only in a qualifying free, public-source application. | Modified/redistributed components remain under the applicable obligations. |

## Examples that do not fit without a separate written license

| Scenario | Why it is outside the proposed permission |
| --- | --- |
| A free chart page displays banner ads, sponsored posts, affiliate broker links that generate revenue, or paid promotional placements. | Advertising and revenue-generating affiliate promotions are prohibited. |
| A free basic chart has a paid indicator, premium data view, higher rate limit, paid removal of a watermark, or "pro" account. | Any Paid Feature, premium tier, or paid product benefit is prohibited. |
| A service requires a monthly plan, prepaid credits, a token balance, or a paid API key to use chart functionality. | Subscription Access and paid access are prohibited. |
| A hosted application publishes only its frontend while keeping required backend logic private. | Required source for a Hosted Application/SaaS must be publicly available. |
| A project calls a payment a donation but donors obtain priority support, an increased quota, voting rights, a badge, early access, or an ad-free experience. | The payment is not a Voluntary Donation because it carries a product benefit. |
| A company distributes a modified OpenKline package without the applicable license, notices, modification notice, or publicly available source. | Redistribution and modification obligations are not met. |
| A project is free to end users but requires an employer, school, sponsor, or partner to pay for users' access or capacity. | The application is not free for all end users if payment is required for access or benefit. |

## Situations requiring counsel or a written exception

- Paid consulting, support, hosting, data, or implementation services tied to
  a Consumer Application may be outside the policy even if its visible feature
  list is free. Do not treat them as permitted merely because the company has
  other revenue.
- A paid app that uses OpenKline only during internal development, a white-label
  deployment, enterprise-only service, or closed beta still needs counsel to
  determine scope and may require a separate written license.
- A product with public source under an OSI-approved license is not
  automatically compatible; see the [compatibility analysis](./license-compatibility-analysis.md).
- Whether a plugin, separate service, API client, linking arrangement, or
  integration is a Derivative Work depends on facts and applicable law.
- Charitable fundraising, grants, non-cash benefits, sponsorship, and public
  recognition can carry value. Counsel should decide whether they are
  Voluntary Donations or prohibited consideration in the final text.

No example creates a commercial exception. Only a separate written license
signed by the authorized OpenKline copyright holder can authorize a use outside
the final adopted terms.
