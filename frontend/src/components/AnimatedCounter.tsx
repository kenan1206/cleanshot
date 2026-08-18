// Animated number counter: smoothly counts from 0 to value when value changes.
import React, { useEffect, useRef, useState } from "react";
import { Text, StyleProp, TextStyle } from "react-native";

type Props = {
  value: number;
  duration?: number;
  style?: StyleProp<TextStyle>;
  formatter?: (n: number) => string;
  testID?: string;
};

export default function AnimatedCounter({
  value,
  duration = 900,
  style,
  formatter = (n) => n.toLocaleString(),
  testID,
}: Props) {
  const [displayed, setDisplayed] = useState(0);
  const prevRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (start === end) return;

    if (timerRef.current) clearInterval(timerRef.current);

    const steps = 36;
    let step = 0;

    timerRef.current = setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const next = Math.round(start + (end - start) * eased);
      setDisplayed(next);
      if (step >= steps) {
        clearInterval(timerRef.current!);
        setDisplayed(end);
        prevRef.current = end;
      }
    }, duration / steps);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [value, duration]);

  return (
    <Text style={style} testID={testID}>
      {formatter(displayed)}
    </Text>
  );
}
