import { NextResponse } from "next/server";
import { seedMethodsWorkbenchDemo } from "@/server/methodsDemoSeed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const demo = seedMethodsWorkbenchDemo();
    return NextResponse.json(demo, { status: demo.created ? 201 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not seed the Methods Workbench demo.",
      },
      { status: 500 },
    );
  }
}
