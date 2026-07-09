export interface WorkItem {
  id: string; title: string; type: string; status: string; assignee?: string;
  createdAt?: string; completedAt?: string; points?: number; labels: string[];
}
export interface SprintData { name: string; start?: string; end?: string; items: WorkItem[] }

export async function fromJira(baseUrl: string, boardId: string, token: string): Promise<SprintData> {
  const sprintResponse = await api(`${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active,closed&maxResults=50`, token);
  const sprint = sprintResponse.values?.at(-1);
  if (!sprint) throw new Error("Sprint Jira não encontrada");
  const issues = await api(`${baseUrl}/rest/agile/1.0/sprint/${sprint.id}/issue?maxResults=1000`, token);
  return {
    name: sprint.name, start: sprint.startDate, end: sprint.endDate,
    items: issues.issues.map((issue: any) => ({
      id: issue.key, title: issue.fields.summary, type: issue.fields.issuetype?.name ?? "Item",
      status: issue.fields.status?.name ?? "Unknown", assignee: issue.fields.assignee?.displayName,
      createdAt: issue.fields.created, completedAt: issue.fields.resolutiondate,
      points: issue.fields.customfield_10016, labels: issue.fields.labels ?? []
    }))
  };
}

export async function fromAzure(org: string, project: string, team: string, token: string): Promise<SprintData> {
  const auth = `Basic ${Buffer.from(`:${token}`).toString("base64")}`;
  const base = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis`;
  const iterations = await api(`${base}/work/teamsettings/iterations?$timeframe=current&api-version=7.1`, auth, true);
  const iteration = iterations.value?.[0];
  if (!iteration) throw new Error("Sprint Azure DevOps não encontrada");
  const relations = await api(`${base}/work/teamsettings/iterations/${iteration.id}/workitems?api-version=7.1`, auth, true);
  const ids = relations.workItemRelations?.map((r: any) => r.target?.id).filter(Boolean) ?? [];
  const items = ids.length ? await api(`https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/wit/workitems?ids=${ids.join(",")}&api-version=7.1`, auth, true) : { value: [] };
  return {
    name: iteration.name, start: iteration.attributes?.startDate, end: iteration.attributes?.finishDate,
    items: items.value.map((item: any) => ({
      id: String(item.id), title: item.fields["System.Title"], type: item.fields["System.WorkItemType"],
      status: item.fields["System.State"], assignee: item.fields["System.AssignedTo"]?.displayName,
      createdAt: item.fields["System.CreatedDate"], points: item.fields["Microsoft.VSTS.Scheduling.StoryPoints"],
      labels: (item.fields["System.Tags"] ?? "").split(";").map((x: string) => x.trim()).filter(Boolean)
    }))
  };
}

async function api(url: string, token: string, rawAuthorization = false): Promise<any> {
  const response = await fetch(url, { headers: { authorization: rawAuthorization ? token : `Bearer ${token}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`API respondeu ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}
