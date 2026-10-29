import { useParams } from "react-router-dom";
import { PageEditor } from "@/features/editor/page-editor";

export function PageView() {
  const { id = "" } = useParams();
  return <PageEditor pageId={id} />;
}
