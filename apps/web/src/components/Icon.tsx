import type { SVGProps } from "react";

type IconName =
  | "activity"
  | "calendar"
  | "chevron"
  | "droplet"
  | "layers"
  | "spark"
  | "temperature"
  | "wind";

const paths: Record<IconName, string[]> = {
  activity: ["M3 12h4l2.5-6 4.5 12 3-6h4"],
  calendar: ["M5 3v3M19 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"],
  chevron: ["m9 18 6-6-6-6"],
  droplet: ["M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z"],
  layers: ["m12 3 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 18l9 5 9-5"],
  spark: ["m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3ZM5 16l.7 2.3L8 19l-2.3.7L5 22l-.7-2.3L2 19l2.3-.7L5 16Z"],
  temperature: ["M10 5a2 2 0 0 1 4 0v8.2a4 4 0 1 1-4 0V5Zm2 4v7"],
  wind: ["M3 8h10a2.5 2.5 0 1 0-2.4-3M3 12h16a2 2 0 1 1-2 2M3 16h8"],
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      {...props}
    >
      {paths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
