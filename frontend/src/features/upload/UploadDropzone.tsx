import clsx from "clsx";
import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { ACCEPT_ATTR, ALLOWED_UPLOAD_EXTS } from "../../lib/constants";

export function UploadDropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={clsx(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors",
        dragging
          ? "border-accent bg-accent/5"
          : "border-border bg-bg-subtle hover:border-gray-500 hover:bg-bg-raised/50"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <UploadCloud className={clsx("mb-3 h-10 w-10", dragging ? "text-accent" : "text-gray-600")} />
      <p className="text-sm font-medium text-gray-200">
        Drag &amp; drop videos here, or click to browse
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {ALLOWED_UPLOAD_EXTS.map((e) => `.${e}`).join("  ")}
      </p>
    </div>
  );
}
