import ast
from .gemini import grade_answer, semantic_similarity


def code_structure(answer, language, checks):
    # Parsing only. Never evaluate, compile-to-run, import, or execute candidate code.
    features = set()
    try:
        if language == "python":
            tree = ast.parse(answer)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    features.add("function")
                if isinstance(
                    node,
                    (
                        ast.For,
                        ast.While,
                        ast.ListComp,
                        ast.DictComp,
                        ast.SetComp,
                        ast.GeneratorExp,
                    ),
                ):
                    features.add("loop")
                if isinstance(node, (ast.If, ast.IfExp, ast.Match)):
                    features.add("conditional")
                if isinstance(node, ast.Return):
                    features.add("return")
                if isinstance(node, (ast.Try, ast.Raise)):
                    features.add("exception")
                if isinstance(node, (ast.AsyncFunctionDef, ast.Await)):
                    features.add("async")
        else:
            from tree_sitter import Language, Parser

            if language == "typescript":
                import tree_sitter_typescript

                grammar = tree_sitter_typescript.language_typescript()
            else:
                import tree_sitter_javascript

                grammar = tree_sitter_javascript.language()
            root = Parser(Language(grammar)).parse(answer.encode()).root_node
            if root.has_error:
                return 0, ["syntax_error"]
            stack = [root]
            while stack:
                node = stack.pop()
                name = node.type
                if name in (
                    "function_declaration",
                    "function_expression",
                    "arrow_function",
                    "method_definition",
                ):
                    features.add("function")
                if name in (
                    "for_statement",
                    "for_in_statement",
                    "while_statement",
                    "do_statement",
                ):
                    features.add("loop")
                if name in ("if_statement", "ternary_expression", "switch_statement"):
                    features.add("conditional")
                if name == "return_statement":
                    features.add("return")
                if name in ("try_statement", "throw_statement"):
                    features.add("exception")
                if name in ("await_expression", "async"):
                    features.add("async")
                stack.extend(node.children)
    except (SyntaxError, ValueError, RecursionError):
        return 0, ["syntax_error"]
    coverage = sum(c["kind"] in features for c in checks) / len(checks) if checks else 1
    return 0.4 + 0.6 * coverage, ["static_analysis_only"]


def evaluate(question, answer, elapsed, accommodation=1):
    base = {
        "score": 0,
        "technical": 0,
        "reasoning": 0,
        "communication": 0,
        "efficiency": 0,
        "semantic": 0,
        "coverage": 0,
        "code_structure": None,
        "evidence": [],
        "feedback": "No answer was submitted.",
        "confidence": "high",
        "flags": [],
    }
    if not answer.strip():
        return base
    semantic = semantic_similarity(answer, question["expected_answer"])
    result = grade_answer(question, answer)
    concepts = sorted(result.concepts, key=lambda c: c.index)
    denominator = sum(c["weight"] for c in question["concepts"])
    coverage = (
        sum(c.coverage * question["concepts"][c.index]["weight"] for c in concepts) / denominator
    )
    flags = []
    structure = None
    if question["kind"] == "code":
        structure, flags = code_structure(
            answer, question["language"], question.get("code_checks", [])
        )
        technical = 0.15 * semantic + 0.55 * coverage + 0.3 * structure
    else:
        technical = 0.3 * semantic + 0.7 * coverage
    if "syntax_error" in flags:
        technical = min(technical, 0.4)
    if any(c.contradiction and question["concepts"][c.index].get("critical") for c in concepts):
        technical = min(technical, 0.4)
        flags.append("critical_misconception")
    reasoning = result.reasoning / 4
    communication = result.communication / 4
    quality = 0.75 * technical + 0.20 * reasoning + 0.05 * communication
    efficiency = min(1, question["expected_seconds"] * accommodation / max(elapsed, 1)) * quality
    if abs(semantic - coverage) > 0.5 or result.uncertainty:
        flags.append("review_recommended")
    evidence = [
        {
            "concept": question["concepts"][c.index]["name"],
            "coverage": c.coverage,
            "quote": c.quote,
            "start": answer.find(c.quote) if c.quote else None,
            "end": answer.find(c.quote) + len(c.quote) if c.quote else None,
            "explanation": c.explanation,
            "contradiction": c.contradiction,
        }
        for c in concepts
    ]
    return {
        "score": round(quality * 100, 2),
        "technical": round(technical * 100, 2),
        "reasoning": reasoning * 100,
        "communication": communication * 100,
        "efficiency": round(efficiency * 100, 2),
        "semantic": round(semantic * 100, 2),
        "coverage": round(coverage * 100, 2),
        "code_structure": round(structure * 100, 2) if structure is not None else None,
        "evidence": evidence,
        "feedback": result.feedback,
        "confidence": "low" if "review_recommended" in flags else "medium",
        "flags": flags,
    }
