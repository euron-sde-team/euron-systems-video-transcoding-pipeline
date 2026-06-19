import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useSettings } from "../hooks/useSettings";

/** Shown above content until the operator supplies API base + key + tenant. */
export function ConfigBanner() {
  const { configured } = useSettings();
  if (configured) return null;
  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <span>
        Connection is not configured. Add your API base URL, service key, and tenant id in{" "}
        <Link to="/settings" className="font-semibold underline underline-offset-2">
          Settings
        </Link>
        .
      </span>
    </div>
  );
}
