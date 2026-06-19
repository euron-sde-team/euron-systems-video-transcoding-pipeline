import clsx from "clsx";
import { useHealth } from "../hooks/useHealth";
import { useSettings } from "../hooks/useSettings";

/** Topbar dot reflecting reachability of the pipeline API. */
export function ConnectionStatus() {
  const { configured } = useSettings();
  const { data, isError, isLoading, isFetching } = useHealth();

  let tone: "ok" | "bad" | "idle" | "checking" = "idle";
  let label = "Not configured";
  if (configured) {
    if (isLoading || isFetching) {
      tone = "checking";
      label = "Checking";
    }
    if (data) {
      tone = "ok";
      label = "Connected";
    }
    if (isError) {
      tone = "bad";
      label = "Unreachable";
    }
  }

  const dot = {
    ok: "bg-emerald-400",
    bad: "bg-rose-500",
    checking: "bg-amber-400 animate-pulse",
    idle: "bg-gray-500",
  }[tone];

  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <span className={clsx("h-2 w-2 rounded-full", dot)} />
      <span>{label}</span>
    </div>
  );
}
