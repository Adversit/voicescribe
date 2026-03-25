export function RecordingOverlay() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent p-4">
      <div className="flex min-w-[220px] items-center gap-4 rounded-full border border-white/30 bg-[#1c0f0bcc] px-5 py-3 text-white shadow-2xl backdrop-blur">
        <span className="inline-flex h-4 w-4 animate-pulse rounded-full bg-[#ff6840]" />
        <div>
          <div className="text-sm font-semibold">VoiceScribe</div>
          <div className="text-xs text-white/70">录音状态窗口</div>
        </div>
      </div>
    </div>
  );
}
