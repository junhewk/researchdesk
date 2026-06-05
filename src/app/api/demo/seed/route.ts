import { NextResponse } from "next/server";
import { seedDiabetesDemo } from "@/server/demoSeed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const demo = seedDiabetesDemo();
    return NextResponse.json(demo, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not seed the demo data.",
      },
      { status: 500 },
    );
  }
}
