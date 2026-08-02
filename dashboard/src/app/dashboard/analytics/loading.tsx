export default function AnalyticsLoading() {
  return (
    <div className="grid animate-pulse gap-4 bg-[#f4f7fb] p-6 sm:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="h-28 rounded-2xl bg-white" />
      ))}
    </div>
  );
}
