import { MediaCenter } from "../../../components/media/media-center";
export const metadata = { title: "Media center | OSEKOLA" };
export default async function MediaPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) { const { category } = await searchParams; return <MediaCenter initialCategory={category === "learning" ? "learning" : "gallery"}/>; }
