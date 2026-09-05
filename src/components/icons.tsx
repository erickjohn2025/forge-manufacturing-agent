import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export const SparkIcon = (props: IconProps) => <Icon {...props}><path d="m12 2 1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9L12 2Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></Icon>;
export const TargetIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></Icon>;
export const SlidersIcon = (props: IconProps) => <Icon {...props}><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></Icon>;
export const ArrowIcon = (props: IconProps) => <Icon {...props}><path d="M5 12h14M13 6l6 6-6 6"/></Icon>;
export const CheckIcon = (props: IconProps) => <Icon {...props}><path d="m5 12 4 4L19 6"/></Icon>;
export const ClockIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>;
export const AlertIcon = (props: IconProps) => <Icon {...props}><path d="M10.3 3.7 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></Icon>;
export const BoxIcon = (props: IconProps) => <Icon {...props}><path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="m3 8 9 5 9-5v9l-9 5-9-5V8Z"/><path d="M12 13v9"/></Icon>;
export const LogoutIcon = (props: IconProps) => <Icon {...props}><path d="M10 17l5-5-5-5M15 12H3"/><path d="M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></Icon>;
export const MessageIcon = (props: IconProps) => <Icon {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"/><path d="M8 9h8M8 13h5"/></Icon>;
export const FactoryIcon = (props: IconProps) => <Icon {...props}><path d="M3 21V9l6 3V8l6 4V4h4l2 17H3Z"/><path d="M7 17h1M12 17h1M17 17h1"/></Icon>;
export const FloorIcon = (props: IconProps) => <Icon {...props}><path d="M4 10h16v10H4zM8 10V6h8v4M4 14h16M12 14v6"/></Icon>;
export const StampIcon = (props: IconProps) => <Icon {...props}><path d="M8 14h8l2 3H6l2-3Z"/><path d="M10 14V8a2 2 0 1 1 4 0v6"/><path d="M6 20h12"/></Icon>;
export const PipelineIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="13" width="7" height="7" rx="1.5"/><path d="M10 7.5h2.5a2 2 0 0 1 2 2V13"/></Icon>;
