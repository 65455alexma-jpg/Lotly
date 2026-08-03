import type { Metadata } from "next";
import TrackerApp from "./TrackerApp";

export const metadata: Metadata = {
  title: "Lotly — Buy & Sell Tracker",
  description:
    "Track every purchase, sale, item in stock, and estimated profit in one simple place.",
};

export default function Home() {
  return <TrackerApp />;
}
