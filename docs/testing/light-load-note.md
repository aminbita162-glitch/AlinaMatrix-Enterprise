# Light Load Note — AlinaMatrix Enterprise

> **Enterprise Candidate — Active Development**
> No production claim is made.

This note states the actual user count. It is not a capacity claim.

## Actual user count

**0 real users.**

No real user has registered, logged in, ingested a source document, created a
claim, run a job, reviewed content, or published an artifact through
AlinaMatrix Enterprise. The system has not been deployed to any production
environment. No Render service is live. No live PostgreSQL instance is
running outside of local Docker containers used for development and the R5
backup drill.

## What the test suite measures

The test suite measures **unit correctness**, not load or capacity:

- 1043 tests pass (unit + domain logic).
- 103 tests are skipped (101 integration without live DB, 2 live-model without API key).
- Tests run against mock doubles and in-memory state machines.
- No test exercises concurrent load, throughput, or latency under real traffic.

## What is not claimed

- No concurrent-user capacity claim is made.
- No throughput claim is made (documents/second, claims/second).
- No latency claim is made.
- No scalability claim is made.
- No "supports N users" claim is made.

The number 0 is the actual user count. A small test count is not proof of
real-world capacity.

---

Status: Enterprise Candidate — Active Development.
