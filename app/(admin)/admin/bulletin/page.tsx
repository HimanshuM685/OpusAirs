"use client";
import { useResource } from "@/lib/use-resource";
import { useUrlState } from "@/lib/use-url-state";
import { ResourceState } from "@/components/resource-state";
import { PageHeading } from "@/components/page-heading";
export default function BulletinPage() {
  const { params, update } = useUrlState();
  const frequency = ["daily", "weekly", "monthly"].includes(params.get("frequency") || "") ? params.get("frequency")! : "monthly";
  const resource = useResource<Record<string, unknown>>(`/v1/bulletin?frequency=${frequency}&format=json`);
  return <><PageHeading title="Bulletin">Download the index extract with methodology comments, or print the current view.</PageHeading>
    <div className="toolbar"><label>Frequency<select name="frequency" value={frequency} onChange={(e) => update({ frequency: e.target.value })}><option>daily</option><option>weekly</option><option>monthly</option></select></label>
      <a className="text-link" href={`/v1/bulletin?frequency=${frequency}&format=csv`} download>Download CSV</a><button type="button" onClick={() => window.print()}>Print bulletin</button></div>
    <ResourceState {...resource} retry={resource.refresh} label="bulletin" />
    {resource.data && <pre className="panel bulletin-data" tabIndex={0}>{JSON.stringify(resource.data, null, 2)}</pre>}</>;
}
