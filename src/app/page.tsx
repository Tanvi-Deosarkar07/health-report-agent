import { Disclaimer } from "@/components/Disclaimer";
import { UploadFlow } from "@/components/UploadFlow";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Disclaimer />
      <main className="flex flex-1 justify-center">
        <UploadFlow />
      </main>
    </div>
  );
}
