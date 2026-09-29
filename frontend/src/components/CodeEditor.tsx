import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";
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
            : javascript({ typescript: language === "typescript" }),
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
