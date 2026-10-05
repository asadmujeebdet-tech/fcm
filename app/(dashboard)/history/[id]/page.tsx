import { ReportClient } from "./ReportClient";

export default function CampaignReportPage({ params }: { params: { id: string } }) {
  return <ReportClient id={params.id} />;
}
