"""Versioned, deterministic partial-credit ability heuristic (not calibrated IRT)."""

import hashlib
import math

GRID = [i / 10 for i in range(-30, 31)]


def sigmoid(x):
    return 1 / (1 + math.exp(-x))


def prior():
    values = [math.exp(-x * x / 2) for x in GRID]
    return [x / sum(values) for x in values]


def update(weights, quality, difficulty, weight=1):
    values = []
    for theta, old in zip(GRID, weights or prior()):
        p = sigmoid(theta - difficulty)
        values.append(old * (p**quality * (1 - p) ** (1 - quality)) ** weight)
    return [v / sum(values) for v in values]


def mean(weights):
    return sum(x * w for x, w in zip(GRID, weights or prior()))


def uncertainty(weights):
    center = mean(weights)
    return math.sqrt(sum(w * (x - center) ** 2 for x, w in zip(GRID, weights or prior())))


def update_state(state, question, quality, technical):
    state = dict(state)
    topic = question["topic"]
    state["global"] = update(state.get("global"), quality, question["difficulty"])
    state[topic] = update(state.get(topic), quality, question["difficulty"])
    state["technical:" + topic] = update(
        state.get("technical:" + topic),
        technical,
        question["difficulty"],
        question["weight"],
    )
    return state


def select_question(pool, attempts, skills, ability, seed):
    used = {str(a.question["id"]) for a in attempts}
    available = [q for q in pool if str(q["id"]) not in used]
    if not available:
        return None
    counts = {s["topic"]: sum(a.question["topic"] == s["topic"] for a in attempts) for s in skills}
    eligible = [s for s in skills if any(q["topic"] == s["topic"] for q in available)]
    total_weight = sum(s["weight"] for s in skills)
    topic = max(
        eligible,
        key=lambda s: (
            counts[s["topic"]] == 0,
            (len(attempts) + 1) * s["weight"] / total_weight - counts[s["topic"]],
            -skills.index(s),
        ),
    )["topic"]
    candidates = [q for q in available if q["topic"] == topic]
    target = 0.7 * mean(ability.get(topic)) + 0.3 * mean(ability.get("global"))
    if not attempts:
        candidates = [q for q in candidates if q["difficulty"] == 0]
        if not candidates:
            candidates = [q for q in available if q["difficulty"] == 0]
        target = 0
    else:
        last = attempts[-1]
        if hasattr(last, "evaluation"):
            expected = (
                last.question["expected_seconds"]
                * last.interview.invitation.accommodation_multiplier
            )
            if last.evaluation.score >= 70 and last.elapsed_seconds <= expected:
                target += 0.15
            elif last.elapsed_seconds > expected * 1.5:
                target -= 0.15
        bounded = [q for q in candidates if abs(q["difficulty"] - last.question["difficulty"]) <= 1]
        if bounded:
            candidates = bounded
    return (
        min(
            candidates,
            key=lambda q: (
                abs(q["difficulty"] - target),
                hashlib.sha256(f"{seed}:{q['id']}".encode()).hexdigest(),
            ),
        )
        if candidates
        else None
    )
