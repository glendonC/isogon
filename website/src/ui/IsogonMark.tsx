export function IsogonMark({ className = 'iso-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.2 2.5h7.6l5.7 5.7v2.55L10.75 21.5H8.2L2.5 15.8V8.2L8.2 2.5Zm7.6 19 5.7-5.7v-2.15L13.65 21.5h2.15Z"
      />
      <rect
        x="17.3"
        y="3.9"
        width="3.2"
        height="3.2"
        transform="rotate(45 18.9 5.5)"
        fill="currentColor"
        fillOpacity="0.76"
      />
    </svg>
  );
}
