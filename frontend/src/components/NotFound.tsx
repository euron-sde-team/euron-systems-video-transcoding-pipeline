import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-3xl font-bold text-gray-200">404</p>
      <p className="mt-2 text-sm text-gray-500">This page does not exist.</p>
      <Link
        to="/"
        className="mt-6 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
