"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Quote, 
  Code, 
  Link, 
  Image,
  Heading1,
  Heading2,
  Heading3,
  Eye,
  Edit3,
  Columns,
  CheckSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  autoFocus?: boolean;
}

type ViewMode = "edit" | "preview" | "split";

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write your note in Markdown...",
  minHeight = "300px",
  autoFocus = false,
}: MarkdownEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      const minHeightPixels = minHeight === "100%" ? 300 : 
                             minHeight?.endsWith("px") ? parseInt(minHeight) : 300;
      textareaRef.current.style.height = `${Math.max(scrollHeight, minHeightPixels)}px`;
    }
  }, [value, minHeight]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const insertText = useCallback((before: string, after: string = "", placeholder: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end) || placeholder;
    
    const newText = value.substring(0, start) + before + selectedText + after + value.substring(end);
    onChange(newText);

    // Set cursor position after insertion
    setTimeout(() => {
      textarea.focus();
      const cursorPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  }, [value, onChange]);

  const insertAtLineStart = useCallback((prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    
    const newText = value.substring(0, lineStart) + prefix + value.substring(lineStart);
    onChange(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  }, [value, onChange]);

  const toolbarButtons = [
    { icon: Bold, action: () => insertText("**", "**", "bold"), title: "Bold (Ctrl+B)" },
    { icon: Italic, action: () => insertText("*", "*", "italic"), title: "Italic (Ctrl+I)" },
    { icon: Code, action: () => insertText("`", "`", "code"), title: "Inline Code" },
    { type: "divider" },
    { icon: Heading1, action: () => insertAtLineStart("# "), title: "Heading 1" },
    { icon: Heading2, action: () => insertAtLineStart("## "), title: "Heading 2" },
    { icon: Heading3, action: () => insertAtLineStart("### "), title: "Heading 3" },
    { type: "divider" },
    { icon: List, action: () => insertAtLineStart("- "), title: "Bullet List" },
    { icon: ListOrdered, action: () => insertAtLineStart("1. "), title: "Numbered List" },
    { icon: CheckSquare, action: () => insertAtLineStart("- [ ] "), title: "Task List" },
    { type: "divider" },
    { icon: Quote, action: () => insertAtLineStart("> "), title: "Quote" },
    { icon: Link, action: () => insertText("[", "](url)", "link text"), title: "Link" },
    { icon: Image, action: () => insertText("![", "](url)", "alt text"), title: "Image" },
  ];

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case "b":
          e.preventDefault();
          insertText("**", "**", "bold");
          break;
        case "i":
          e.preventDefault();
          insertText("*", "*", "italic");
          break;
        case "k":
          e.preventDefault();
          insertText("[", "](url)", "link text");
          break;
      }
    }

    // Handle Tab for indentation
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      const newText = value.substring(0, start) + "  " + value.substring(end);
      onChange(newText);
      
      setTimeout(() => {
        textarea.setSelectionRange(start + 2, start + 2);
      }, 0);
    }
  }, [insertText, value, onChange]);

  return (
    <div className="border border-[#252525] rounded-lg overflow-hidden bg-[#0f0f0f]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[#252525] bg-[#161616] px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          {toolbarButtons.map((btn, idx) => (
            btn.type === "divider" ? (
              <div key={idx} className="w-px h-5 bg-[#252525] mx-1.5" />
            ) : (
              <Button
                key={idx}
                type="button"
                variant="ghost"
                size="icon"
                onClick={btn.action}
                className="h-7 w-7 text-slate-400 hover:text-white hover:bg-[#252525]"
                title={btn.title}
                disabled={viewMode === "preview"}
              >
                {btn.icon && <btn.icon className="h-3.5 w-3.5" />}
              </Button>
            )
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-[#0f0f0f] rounded-md p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("edit")}
            className={`h-7 px-2 text-xs ${viewMode === "edit" ? "bg-[#252525] text-white" : "text-slate-400 hover:text-white"}`}
          >
            <Edit3 className="h-3 w-3 mr-1" />
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("split")}
            className={`h-7 px-2 text-xs ${viewMode === "split" ? "bg-[#252525] text-white" : "text-slate-400 hover:text-white"}`}
          >
            <Columns className="h-3 w-3 mr-1" />
            Split
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("preview")}
            className={`h-7 px-2 text-xs ${viewMode === "preview" ? "bg-[#252525] text-white" : "text-slate-400 hover:text-white"}`}
          >
            <Eye className="h-3 w-3 mr-1" />
            Preview
          </Button>
        </div>
      </div>

      {/* Editor/Preview */}
      <div className={`${viewMode === "split" ? "grid grid-cols-2 divide-x divide-[#252525]" : ""}`} style={{ minHeight: typeof minHeight === 'string' && minHeight !== "100%" ? minHeight : undefined }}>
        {/* Editor */}
        {(viewMode === "edit" || viewMode === "split") && (
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full bg-transparent text-white placeholder:text-slate-600 p-4 resize-none focus:outline-none font-mono text-sm leading-relaxed overflow-hidden"
              style={{ minHeight: typeof minHeight === 'string' && minHeight.endsWith('px') ? minHeight : undefined }}
            />
          </div>
        )}

        {/* Preview */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div className="p-4 overflow-auto prose prose-invert prose-sm max-w-none" style={{ minHeight: typeof minHeight === 'string' && minHeight !== "100%" ? minHeight : undefined }}>
            {value ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="text-2xl font-bold text-white mt-6 mb-4 first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xl font-bold text-white mt-5 mb-3">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-bold text-white mt-4 mb-2">{children}</h3>,
                  p: ({ children }) => <p className="text-slate-300 mb-4 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside text-slate-300 mb-4 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside text-slate-300 mb-4 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="text-slate-300">{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-blue-500 pl-4 italic text-slate-400 my-4">{children}</blockquote>
                  ),
                  code: ({ className, children }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="bg-[#252525] text-blue-300 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                    ) : (
                      <code className="block bg-[#161616] text-slate-300 p-4 rounded-lg overflow-x-auto text-sm font-mono my-4">{children}</code>
                    );
                  },
                  pre: ({ children }) => <pre className="bg-[#161616] rounded-lg overflow-x-auto my-4">{children}</pre>,
                  a: ({ href, children }) => (
                    <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>
                  ),
                  img: ({ src, alt }) => (
                    <img src={src} alt={alt} className="rounded-lg max-w-full h-auto my-4" />
                  ),
                  hr: () => <hr className="border-[#252525] my-6" />,
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4">
                      <table className="min-w-full border-collapse border border-[#252525]">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => <th className="border border-[#252525] bg-[#161616] px-4 py-2 text-left text-white font-semibold">{children}</th>,
                  td: ({ children }) => <td className="border border-[#252525] px-4 py-2 text-slate-300">{children}</td>,
                  input: ({ type, checked }) => {
                    if (type === "checkbox") {
                      return (
                        <input
                          type="checkbox"
                          checked={checked}
                          readOnly
                          className="mr-2 accent-blue-500"
                        />
                      );
                    }
                    return null;
                  },
                }}
              >
                {value}
              </ReactMarkdown>
            ) : (
              <p className="text-slate-500 italic">Nothing to preview</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
