"""Original demonstration question bank. All answers and rubrics are recruiter-only."""


def q(title, topic, difficulty, prompt, expected, concepts, **kwargs):
    return dict(
        title=title,
        topic=topic,
        difficulty=difficulty,
        kind="text",
        language="javascript",
        prompt=prompt,
        expected_answer=expected,
        concepts=[
            {"name": n, "description": d, "weight": 1, "critical": i == 0}
            for i, (n, d) in enumerate(concepts)
        ],
        reasoning_criteria="Explain why the approach works, identify trade-offs, and consider an edge or failure case.",
        code_checks=[],
        starter_code="",
        weight=1,
        expected_seconds=150,
        **kwargs,
    )


QUESTIONS = [
    q(
        "The event loop, explained",
        "JavaScript",
        0,
        "A Node.js service runs a CPU-heavy loop while handling requests. Explain what happens to other requests, and how you would address it.",
        "JavaScript runs synchronous callbacks on the main thread. A CPU-heavy loop blocks the event loop, delaying timers and request callbacks even when I/O is asynchronous. Move CPU work to worker threads or a separate worker service; use a bounded worker pool. Splitting work into chunks can improve responsiveness but does not add CPU capacity. Monitor event-loop delay and tail latency.",
        [
            (
                "Blocking behavior",
                "Explain that synchronous CPU work blocks callback processing on the main thread.",
            ),
            ("I/O versus CPU", "Distinguish asynchronous I/O from CPU parallelism."),
            (
                "Worker strategy",
                "Suggest worker threads, a worker process, or bounded background jobs and explain the trade-off.",
            ),
        ],
    ),
    q(
        "Promises and callback ordering",
        "JavaScript",
        0,
        'What is logged, in order, by this code? Explain why.\n\nconsole.log("A");\nsetTimeout(() => console.log("B"), 0);\nPromise.resolve().then(() => console.log("C"));\nconsole.log("D");',
        "The output is A, D, C, B. Synchronous statements run first, so A and D appear before either callback. Promise callbacks are microtasks processed after the current stack empties. The zero-delay timer callback runs in a later timer opportunity; zero is a minimum delay, not immediate execution.",
        [
            ("Execution order", "Give the order A, D, C, B."),
            (
                "Microtasks",
                "Explain that promise callbacks run after the current synchronous stack and before this timer.",
            ),
            (
                "Timer behavior",
                "Explain that zero-delay timers are scheduled rather than immediate.",
            ),
        ],
    ),
    q(
        "Closures in practice",
        "JavaScript",
        -1,
        "What is a closure? Describe a practical use and one issue to watch for.",
        "A closure is a function that retains access to variables in its lexical scope after its enclosing function returns. A counter factory can capture a private count and return a function that increments it. Each factory call creates independent state. Closures can retain objects longer than intended, so long-lived listeners or callbacks should be cleaned up.",
        [
            (
                "Lexical scope",
                "State that the function retains access to its defining lexical environment.",
            ),
            (
                "Practical example",
                "Provide a meaningful example such as private state, a factory, or a callback.",
            ),
            (
                "Lifetime",
                "Recognize that captured state can outlive the enclosing call or retain memory.",
            ),
        ],
    ),
    q(
        "Choosing const, let, and var",
        "JavaScript",
        -1,
        "Explain how const, let, and var differ. Can you change an object declared with const?",
        "Let and const are block scoped, while var is function scoped. Const prevents reassignment of the binding but does not freeze an object; its properties can change. Let allows reassignment. Let and const are unavailable before initialization in the temporal dead zone, whereas var is initialized to undefined. Prefer const unless reassignment is needed.",
        [
            (
                "Binding versus object",
                "Explain that const protects the binding, not object properties.",
            ),
            ("Scope", "Distinguish block scope from function scope."),
            (
                "Initialization",
                "Describe the temporal dead zone or var hoisting correctly.",
            ),
        ],
    ),
    q(
        "Bounded concurrency for API calls",
        "JavaScript",
        1,
        "You must fetch 10,000 URLs. Why might Promise.all(urls.map(fetch)) be a problem? Design a robust alternative.",
        "Mapping fetch over 10,000 URLs starts them eagerly, which can exhaust connections or trigger rate limits; Promise.all does not limit concurrency. Use a bounded worker pool or semaphore, starting perhaps 10 to 20 requests at a time. Apply per-request timeouts with AbortController, bounded retries with jitter for transient failures, and collect per-URL results. Cancel outstanding work when the job is canceled and stream results to avoid unnecessary memory growth.",
        [
            (
                "Eager concurrency",
                "Explain that Promise.all itself does not limit already-started operations.",
            ),
            (
                "Bounded workers",
                "Describe a queue or semaphore that actually limits simultaneous requests.",
            ),
            (
                "Failure handling",
                "Include timeouts, cancellation, selective retries, or partial result handling.",
            ),
        ],
    ),
    q(
        "Implement a debounce function",
        "JavaScript",
        1,
        "Implement debounce(fn, delay) in JavaScript. The returned function should call fn only after calls have stopped for delay milliseconds. Preserve this and arguments. Add a cancel method. Explain an edge case in a comment.",
        "function debounce(fn, delay) {\n  let timer;\n  function debounced(...args) {\n    clearTimeout(timer);\n    const context = this;\n    timer = setTimeout(() => { timer = undefined; fn.apply(context, args); }, delay);\n  }\n  debounced.cancel = () => { clearTimeout(timer); timer = undefined; };\n  return debounced;\n}\n// Repeated calls replace the pending invocation; cancellation prevents the trailing call.",
        [
            (
                "Timer replacement",
                "Cancel the previous timeout before scheduling a new one.",
            ),
            (
                "Context and arguments",
                "Preserve the calling this value and latest arguments.",
            ),
            (
                "Cancellation",
                "Provide a cancel method that prevents pending invocation.",
            ),
        ],
    ),
    q(
        "HTTP methods and idempotency",
        "API design",
        -1,
        "What does idempotency mean for an HTTP API? Compare GET, PUT, and POST.",
        "An idempotent operation has the same intended server-side effect when repeated as when performed once. GET should be safe and idempotent. PUT replaces the resource at a known URI and is intended to be idempotent. POST commonly creates a subordinate resource and may create duplicates when repeated. Responses may differ while the intended effect stays the same. An idempotency key can make a particular POST operation safe to retry.",
        [
            (
                "Repeated effect",
                "Define idempotency by server-side effects rather than identical response bytes.",
            ),
            (
                "Method semantics",
                "Correctly distinguish GET, PUT, and typical POST behavior.",
            ),
            ("Retries", "Connect idempotency to safe retries or duplicate prevention."),
        ],
    ),
    q(
        "Useful API error responses",
        "API design",
        -1,
        "Design an error response for invalid signup input. What should the client receive, and what should stay in server logs?",
        "Return a structured JSON error with a stable code and field-level validation messages, normally a 400 status. Avoid raw stack traces, SQL details, secrets, or account-existence leaks. Include a request correlation ID to investigate failures. Log only necessary operational metadata; never raw passwords. Validation and authorization still run on the server.",
        [
            (
                "Safe details",
                "Avoid leaking stack traces, credentials, or account existence.",
            ),
            (
                "Client usability",
                "Provide stable error codes and actionable validation messages.",
            ),
            (
                "Server validation",
                "Validate on the server and use a request ID with minimal logging.",
            ),
        ],
    ),
    q(
        "Reliable payment retries",
        "API design",
        0,
        "A client times out while creating an order and retries. How can your API prevent duplicate orders without blocking legitimate future purchases?",
        "Accept a client-generated idempotency key scoped to the authenticated customer and operation. Store the key, request fingerprint, and result with a unique constraint. Create the order and key record in one transaction or use a durable state machine for an external payment provider. Return the original result on a matching retry; reject reuse with different input. Define retention and concurrent-request behavior. A new purchase uses a new key.",
        [
            (
                "Atomic uniqueness",
                "Use a database uniqueness guarantee and transaction for concurrent duplicate requests.",
            ),
            (
                "Scoped key",
                "Scope the key to the user and operation while allowing new keys for new purchases.",
            ),
            (
                "Replay result",
                "Replay a stored result and detect a changed request payload.",
            ),
        ],
    ),
    q(
        "Cursor-based pagination",
        "API design",
        0,
        "A feed receives new records while users page through it. Compare offset pagination with cursor pagination and design a stable cursor.",
        "Offset pagination can skip or repeat records when earlier rows are inserted or removed, and large offsets can be expensive. Use keyset pagination ordered by created_at and a unique ID as a tie-breaker. Encode both values in an opaque, validated cursor and query records after that pair with a matching index. Preserve filters and sort direction. Cursor pagination does not naturally support jumping to arbitrary page numbers; snapshot semantics need additional design.",
        [
            ("Stable ordering", "Use an ordered key plus a unique tie-breaker."),
            (
                "Concurrent inserts",
                "Explain offset pagination skips or repeats under changing data.",
            ),
            (
                "Cursor constraints",
                "Validate the cursor and keep filters consistent; mention random-access trade-offs.",
            ),
        ],
    ),
    q(
        "Designing resilient webhooks",
        "API design",
        1,
        "Design a webhook receiver that handles retries, duplicate delivery, and out-of-order events. Describe the trust boundary.",
        "Verify the signature against the raw request body using a secret and constant-time comparison, and enforce a timestamp tolerance. Deduplicate by provider event ID with a unique constraint. Persist the event before acknowledging quickly, then process it through a retryable queue. Make side effects idempotent. Use resource versions or retrieve current provider state for out-of-order events; do not assume delivery order. Rotate secrets, bound payload sizes, and keep a dead-letter/replay path.",
        [
            (
                "Authenticity",
                "Verify the signature and timestamp before trusting the event.",
            ),
            (
                "Durable idempotency",
                "Persist and deduplicate events, with idempotent side effects.",
            ),
            (
                "Ordering and recovery",
                "Handle out-of-order updates and retry/replay failures.",
            ),
        ],
    ),
    q(
        "Protecting multi-tenant resources",
        "API design",
        1,
        "Your API exposes GET /reports/:id. Users belong to different organizations. Describe how you prevent a user from reading another organization’s report, even if they know its ID.",
        "Authenticate the user, resolve their organization membership from trusted server state, and constrain the report query by both ID and organization. Check the requested action against their role. Random UUIDs reduce guessing but do not replace authorization. Apply the same checks to exports, background jobs, nested resources, and caches. Avoid cross-tenant cache keys and test direct object access with two organizations. Return a consistent unavailable response for inaccessible records.",
        [
            (
                "Ownership check",
                "Constrain access by authenticated organization membership and report ownership.",
            ),
            (
                "UUID limitations",
                "Recognize that non-guessable IDs are not authorization.",
            ),
            (
                "Complete boundary",
                "Apply permissions to exports, jobs, caches, and nested routes and test isolation.",
            ),
        ],
    ),
    q(
        "Indexes and their trade-offs",
        "Databases",
        -1,
        "What does a database index do? Why would you not create an index on every column?",
        "An index is an additional data structure that lets the database locate relevant rows without scanning all rows. A B-tree can help equality, range filtering, and ordering. Indexes consume storage and add work to inserts, updates, and deletes. Low-selectivity columns may not benefit much. Choose indexes from actual query patterns and verify plans rather than indexing every column.",
        [
            (
                "Lookup purpose",
                "Explain reducing row scans using an auxiliary structure.",
            ),
            ("Write and storage cost", "Describe write overhead and storage usage."),
            (
                "Query-driven choice",
                "Choose indexes by workload and selectivity or execution plans.",
            ),
        ],
    ),
    q(
        "Transactions and atomicity",
        "Databases",
        -1,
        "You transfer credits between two accounts. Why should the debit and credit occur in a transaction?",
        "A transaction makes the debit and credit atomic: either both commit or neither does. Otherwise a crash can lose or create credits. Validate the balance and protect concurrent updates using row locks, an appropriate isolation level, or a conditional atomic update. Commit only after both operations succeed. Handle deadlocks or serialization failures with bounded retries.",
        [
            ("Atomicity", "Explain all-or-nothing changes and rollback on failure."),
            ("Concurrent updates", "Protect balance checks and writes against races."),
            (
                "Failure recovery",
                "Handle transaction failures without leaving a partial transfer.",
            ),
        ],
    ),
    q(
        "Finding a slow database query",
        "Databases",
        0,
        "An endpoint filters orders by customer_id and sorts by created_at descending. It has become slow as the table grew. How would you investigate and improve it?",
        "Measure the slow query with realistic parameters and inspect EXPLAIN ANALYZE safely. Consider a composite index on customer_id and created_at in the needed ordering; include a unique ID for stable pagination. Select only necessary fields, limit results, and avoid N+1 queries. Check cardinality estimates, row counts, and whether the plan uses the index. Measure read improvements against added write cost.",
        [
            (
                "Plan inspection",
                "Use the execution plan and measurements to locate the bottleneck.",
            ),
            (
                "Composite index",
                "Propose an index aligned with customer filtering and ordering.",
            ),
            (
                "Workload trade-offs",
                "Consider pagination, N+1 queries, or index write costs and validate results.",
            ),
        ],
    ),
    q(
        "The lost-update problem",
        "Databases",
        0,
        "Two requests read stock=1 and both attempt to buy the final item. Explain why a transaction alone might not prevent overselling, and give a safe solution.",
        "At common isolation levels, both transactions can read stock=1 before either writes, so a transaction alone does not serialize the check. Use a conditional atomic UPDATE that decrements stock only where stock > 0 and check the affected-row count. Alternatively, lock the row with SELECT FOR UPDATE before checking, or use serializable isolation with retries. Keep the order write in the same transaction and use an idempotency key for retries.",
        [
            (
                "Race explanation",
                "Explain that separate reads and writes can both pass the stock check.",
            ),
            (
                "Atomic guard",
                "Use a conditional update, row lock, or correctly retried serializable transaction.",
            ),
            (
                "Outcome handling",
                "Check whether the update succeeded and preserve order consistency.",
            ),
        ],
    ),
    q(
        "Reliable events with an outbox",
        "Databases",
        1,
        "A service commits an order to PostgreSQL and then publishes an event to a message broker. What failure can occur, and how does a transactional outbox address it?",
        "If the database commits but publishing fails, downstream systems never learn about the order. Publishing first can produce an event for an order that rolls back. Write the order and an outbox row in one database transaction. A separate relay reads pending outbox rows and publishes with retries. A crash after publication before marking sent can duplicate delivery, so consumers must deduplicate or make effects idempotent. Monitor backlog and retention; this is typically at-least-once delivery, not magic exactly-once processing.",
        [
            (
                "Dual-write failure",
                "Explain the gap between database commit and broker publish.",
            ),
            (
                "Atomic outbox",
                "Store the business update and outbox event in one transaction.",
            ),
            (
                "Duplicate delivery",
                "Recognize at-least-once delivery and consumer idempotency.",
            ),
        ],
    ),
    q(
        "Isolation levels and write skew",
        "Databases",
        1,
        "Two on-call doctors can each go off duty only if another doctor remains on call. How can snapshot isolation allow both to go off duty? Suggest a safe approach.",
        "Each transaction can read a snapshot showing the other doctor on call, then update a different row. The updates do not conflict directly, but together violate the cross-row invariant; this is write skew. Serializable isolation detects an unsafe dependency and aborts a transaction, which must be retried. Alternatively lock a shared coordination row or all relevant rows in a consistent order and check the invariant under that lock. A per-row constraint alone cannot express this multi-row rule.",
        [
            (
                "Write skew",
                "Identify disjoint writes based on a shared stale predicate.",
            ),
            (
                "Serializable retry",
                "Use serializable isolation with retry or a shared locking strategy.",
            ),
            (
                "Cross-row invariant",
                "Explain why checking only the updated row does not protect the rule.",
            ),
        ],
    ),
]
QUESTIONS[5]["kind"] = "code"
QUESTIONS[5]["starter_code"] = "function debounce(fn, delay) {\n  // Your implementation\n}\n"
QUESTIONS[5]["code_checks"] = [
    {"kind": "function", "description": "Defines a reusable debounce function."},
    {"kind": "return", "description": "Returns the debounced callable."},
]
QUESTIONS[5]["expected_seconds"] = 240
