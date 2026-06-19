import clsx from "clsx";
import { useState } from "react";
import { Loader2, Plug } from "lucide-react";
import { getHealth } from "../../api/health";
import { useToast } from "../../components/Toast";
import { useSettings } from "../../hooks/useSettings";
import { ApiError } from "../../lib/apiClient";

export function SettingsPage() {
  const { settings, save } = useSettings();
  const toast = useToast();

  const [form, setForm] = useState({ ...settings });
  const [testing, setTesting] = useState(false);

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const onSave = () => {
    save(form);
    toast.success("Settings saved");
  };

  const onTest = async () => {
    save(form); // persist first so the client uses the latest values
    setTesting(true);
    try {
      const health = await getHealth();
      toast.success(`Connected to ${health.service} (${health.status})`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Connection failed";
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const inputCls =
    "w-full rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent/60";

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h2 className="text-lg font-semibold text-gray-100">Connection</h2>
      <p className="mt-1 text-sm text-gray-500">
        These values stay in your browser (localStorage). The service key is sent as the
        <code className="mx-1 rounded bg-bg-raised px-1 py-0.5 text-xs">X-Service-Key</code>
        header on every request.
      </p>

      <div className="mt-6 space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-gray-300">API base URL</span>
          <input
            {...field("apiBase")}
            className={inputCls}
            placeholder="http://localhost:4020/api/v1"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-gray-300">Service key</span>
          <input
            {...field("serviceKey")}
            type="password"
            className={inputCls}
            placeholder="SERVICE_API_KEY"
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-gray-300">Tenant ID</span>
          <input {...field("tenantId")} className={inputCls} placeholder="tenant UUID" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-gray-300">
            Preview user ID
            <span className="ml-2 font-normal text-gray-500">
              (baked into minted playback tokens)
            </span>
          </span>
          <input {...field("previewUserId")} className={inputCls} placeholder="admin-preview" />
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-gray-300">
            Streaming format
            <span className="ml-2 font-normal text-gray-500">
              (manifest the player loads; same segments)
            </span>
          </span>
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["hls", "dash"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setForm((f) => ({ ...f, streamFormat: fmt }))}
                className={clsx(
                  "rounded px-4 py-1.5 text-sm font-medium transition-colors",
                  form.streamFormat === fmt
                    ? "bg-accent text-white"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                {fmt === "hls" ? "HLS (.m3u8)" : "DASH (.mpd)"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-7 flex items-center gap-3">
        <button
          onClick={onSave}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Save
        </button>
        <button
          onClick={onTest}
          disabled={testing || !form.apiBase}
          className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-gray-200 hover:bg-bg-raised disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          Test connection
        </button>
      </div>
    </div>
  );
}
