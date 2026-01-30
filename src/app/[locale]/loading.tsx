
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export default function Loading() {
  const t = useTranslations("Shared");
  return (
    <div className="flex flex-col justify-center items-center h-screen gap-4">
      <Loader2 className="h-16 w-16 animate-spin" />
      <p>{t("loading")}</p>
    </div>
  );
}
