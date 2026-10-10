export function Disclaimer() {
  return (
    <div className="w-full border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <p className="mx-auto max-w-4xl">
        <span className="font-semibold">Not medical advice — illustrative demo only.</span> This tool
        explains lab results in plain language for informational purposes only. The reference ranges
        used are placeholder data and have not been clinically verified. It does not diagnose
        conditions, is not a substitute for professional medical care, and does not recommend
        medication dosing. Always consult a licensed physician about your health.
      </p>
    </div>
  );
}
