# Proposed source-available license compatibility analysis

Status: **Non-binding engineering/legal-issue analysis, not legal advice.** The
proposed OpenKline policy is custom and has not been adopted or reviewed by
qualified counsel. No compatibility conclusion in this document authorizes use
or redistribution.

## Core conclusion

The proposed OpenKline Source-Available Community License is **not an
OSI-approved Open Source license**. Its conditions require a consuming
application to be free for all end users, publicly source-available, free of
paid features/subscriptions/advertising/revenue-generating affiliates, and
subject to special redistribution terms. Those restrictions are contrary to
key parts of the OSI Open Source Definition, including the principles against
discrimination by field of endeavor and against restrictions on other software
distributed with the licensed work.

Therefore, an application can be source-available and still not be OSI Open
Source. It must not claim that OpenKline itself is OSI-approved or that its
custom terms are generally compatible with every OSI-approved license.

## Potential contradiction with the policy goal

The stated policy goal is to allow genuinely open, source-available consumer
applications. The custom restrictions may permit many such applications in
practice, but they create these tensions:

1. OSI-approved licenses allow commercial use, charging fees, advertising, and
   use in every field of endeavor. The proposed terms prohibit several of those
   uses for a Consumer Application.
2. Copyleft licenses often prohibit adding further restrictions to rights that
   they grant. A whole-application condition can be an additional restriction.
3. A consumer application's own OSI-approved license may allow recipients to
   create paid, closed, or ad-supported forks. The OpenKline terms would deny
   permission to use OpenKline in those forks, creating a practical and
   possibly legal incompatibility for the combined distribution.
4. Requiring source code for a Hosted Application/SaaS is broader than many
   OSI licenses' distribution triggers; it resembles network-copyleft policy
   goals but adds non-commercial and advertising conditions.

The policy can accurately be described as **source-available with free/public-
source consumer-application conditions**. It should not be marketed simply as
"open source" unless counsel separately confirms that claim for a specific
component under a distinct OSI-approved license.

## OSI-license interaction matrix

| Consumer application's own license | Preliminary interaction | Reason / required action |
| --- | --- | --- |
| MIT, BSD, ISC, Apache-2.0 | **Not automatically incompatible, but conditional** | Permissive licenses allow additional code under other terms, but they do not make the whole Consumer Application satisfy OpenKline's no-fee/no-ad/source conditions. Retain all third-party notices and document the custom OpenKline condition. Counsel must review the combined distribution and trademark/patent implications. |
| GPL-2.0-only, GPL-3.0-only, AGPL-3.0-only | **Potentially incompatible** | These licenses restrict imposing further recipient restrictions. OpenKline's whole-application, monetization, and source conditions may be further restrictions when the Work and GPL-covered code form one combined/derivative work. Do not distribute such a combination without qualified counsel or a separate written OpenKline license. |
| LGPL-2.1-or-later / LGPL-3.0-only | **Fact-dependent; counsel required** | Linking, modification, and combined-work scope affect the analysis. The proposed OpenKline conditions may create additional-restriction issues for portions governed by LGPL terms. |
| MPL-2.0, EPL-2.0, CDDL-1.0 | **Fact-dependent; counsel required** | File-level or weak-copyleft structures can permit larger works under different terms, but a condition imposed on the entire Consumer Application and hosted use needs specific review. |
| AGPL-style hosted-source projects | **Not automatically compatible** | Public server source may help meet one OpenKline condition, but AGPL does not prohibit paid access, ads, or commercial use. The OpenKline conditions still apply independently. |

This table does not decide whether a particular integration is a derivative
work, a mere aggregation, or a separate work. It also does not analyze every
version, exception, dual-license, jurisdiction, patent, trademark, database,
or consumer-protection issue.

## Conditions for an application that uses OSI-licensed components

Even where a consumer application's own license is OSI-approved, the project
should, before treating OpenKline use as permitted:

1. confirm that the Consumer Application actually meets every proposed
   OpenKline condition, including hosted-service source availability;
2. retain and comply with all licenses/notices for every other component;
3. identify whether OpenKline is linked, embedded, modified, or merely
   communicated with, and obtain counsel's derivative-work analysis;
4. document the custom OpenKline condition and refrain from implying that it
   is OSI-approved or that an OSI license alone resolves compatibility;
5. obtain a separate written license if any OpenKline condition cannot be met.

## Questions counsel must resolve before adoption

- Enforceability and territorial scope of no-fee, no-advertising, source,
  hosted-service, donation, termination, and redistribution conditions.
- Whether the desired scope should regulate only modifications/derivative works
  or every Consumer Application that uses the Work; this affects linking and
  compatibility analysis.
- Patent grant or reservation, trademark policy, attribution, warranty,
  liability, indemnity, privacy, export, and governing-law language.
- Exact treatment of paid support, managed hosting, grants, sponsorship,
  affiliate programs, data services, employees, and unrelated company revenue.
- Whether a separate commercial license program is desired, who may sign it,
  and how exceptions are documented.

Until counsel-approved final terms are adopted, all applications require the
copyright holder's written permission; this proposed analysis does not grant
that permission.
