// The big "go to this address and type this code" banner shown on the host's projector.
export default function JoinBanner({ code }) {
  const site = window.location.host;
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <p className="text-slate-600">
        Join at <span className="font-semibold text-slate-900">{site}</span> with code
      </p>
      <p className="mt-2 font-mono text-6xl font-black tracking-[0.25em] text-brand-700 sm:text-7xl" data-testid="room-code">
        {code}
      </p>
    </div>
  );
}
