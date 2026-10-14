import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { StreamLanguage } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

const htmlLanguage = StreamLanguage.define({
  startState: () => ({ inTag: false, quote: "" }),
  token(stream, state) {
    if (stream.match("<!--")) {
      while (!stream.eol() && !stream.match("-->", false)) stream.next();
      stream.match("-->");
      return "comment";
    }
    if (!state.inTag && stream.match("<!")) {
      stream.skipToEnd();
      return "meta";
    }
    if (!state.inTag && stream.match("</?")) {
      state.inTag = true;
      stream.eatWhile(/[\w:-]/);
      return "tag";
    }
    if (state.inTag) {
      if (state.quote) {
        while (!stream.eol()) {
          if (stream.next() === state.quote) {
            state.quote = "";
            break;
          }
        }
        return "string";
      }
      if (stream.eatSpace()) return null;
      if (stream.match("/>") || stream.match(">")) {
        state.inTag = false;
        return "tag";
      }
      if (stream.eat("=")) return "operator";
      const quote = stream.peek();
      if (quote === '"' || quote === "'") {
        state.quote = quote;
        stream.next();
        return "string";
      }
      if (stream.match(/[\w:-]+/)) return "attribute";
    }
    stream.next();
    return null;
  },
});
const cssLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match("/*")) {
      while (!stream.eol() && !stream.match("*/", false)) stream.next();
      stream.match("*/");
      return "comment";
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/@[\w-]+/)) return "meta";
    if (stream.match(/[\w-]+(?=\s*:)/)) return "propertyName";
    if (stream.match(/[.#]?[\w-]+(?=\s*[,>{])/)) return "tag";
    if (stream.match(/[{}:;,]/)) return "operator";
    if (stream.match(/#[\da-fA-F]{3,8}\b/)) return "number";
    if (stream.match(/-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|s|ms)?/))
      return "number";
    if (stream.match(/"[^\"]*"|'[^']*'/)) return "string";
    stream.next();
    return null;
  },
});
const sqlKeywords =
  /^(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|AND|OR|NOT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|CASE|WHEN|THEN|ELSE|END|NULL|IS|IN|EXISTS|WITH|UNION|DISTINCT|PRIMARY|KEY|FOREIGN|REFERENCES|BEGIN|COMMIT|ROLLBACK)\b/i;
const sqlLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match("--")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/'(?:[^']|'')*'/)) return "string";
    if (stream.eatSpace()) return null;
    if (stream.match(sqlKeywords)) return "keyword";
    if (stream.match(/\b\d+(?:\.\d+)?\b/)) return "number";
    if (stream.match(/[A-Za-z_][\w$]*/)) return "variableName";
    if (stream.match(/[(),.*=<>;]/)) return "operator";
    stream.next();
    return null;
  },
});
const commonLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match(/\/\/.*$/) || stream.match(/#.*$/)) return "comment";
    if (stream.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/)) return "string";
    if (stream.eatSpace()) return null;
    if (
      stream.match(
        /\b(?:class|struct|interface|enum|fn|func|fun|function|def|return|if|else|for|while|switch|case|break|continue|const|let|var|static|public|private|protected|async|await|try|catch|throw|throws|import|from|package|module|use|new|this|self|true|false|null|nil|None|Some|Result|match|go|defer|select|chan|type|extends|implements|yield|in|of)\b/,
      )
    )
      return "keyword";
    if (stream.match(/\b\d+(?:\.\d+)?\b/)) return "number";
    if (stream.match(/[A-Za-z_$][\w$]*/)) return "variableName";
    if (stream.match(/[{}()[\].,:;=+*/<>!-]/)) return "operator";
    stream.next();
    return null;
  },
});
const theme = EditorView.theme({
  "&": { fontSize: "13px", backgroundColor: "#fdfbff" },
  ".cm-content": { fontFamily: "Consolas, monospace", padding: "14px 0" },
  ".cm-gutters": { background: "#f7f0fc", border: "none", color: "#a88eb9" },
  ".cm-scroller": { minHeight: "300px" },
});
export default function CodeEditor({
  value,
  onChange,
  language,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  language: string;
  disabled: boolean;
}) {
  return (
    <div className="code-editor">
      <div className="code-editor-bar">
        <span>{language}</span>
        <small>
          Static code assessment · Explain your approach in comments
        </small>
      </div>
      <CodeMirror
        value={value}
        onChange={onChange}
        height="350px"
        extensions={[
          language === "python"
            ? python()
            : language === "html"
              ? htmlLanguage
              : language === "css"
                ? cssLanguage
                : language === "sql"
                  ? sqlLanguage
                  : ["javascript", "typescript"].includes(language)
                    ? javascript({ typescript: language === "typescript" })
                    : commonLanguage,
          theme,
          EditorView.lineWrapping,
        ]}
        editable={!disabled}
        aria-label="Your code solution"
        basicSetup={{
          autocompletion: true,
          lineNumbers: true,
          highlightActiveLine: true,
        }}
      />
    </div>
  );
}
