import { Chart } from "@tanstack/charts/react";
import { barY, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";

export interface MiniChartDatum {
  label: string;
  value: number;
}

export interface MiniChartProps {
  data: MiniChartDatum[];
  label?: string;
  height?: number;
  className?: string;
}

export function MiniChart({ data, label = "Values", height = 180, className }: MiniChartProps) {
  const definition = defineChart({
    marks: [barY(data, { x: "label", y: "value" })],
    scales: {
      x: { scale: () => scaleBand<string>() },
      y: { scale: scaleLinear, nice: true },
    },
  });

  return (
    <Chart
      definition={definition}
      ariaLabel={label}
      ariaDescription={`Chart of ${label.toLowerCase()}`}
      height={height}
      className={className}
    />
  );
}
