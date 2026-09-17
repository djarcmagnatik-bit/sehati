import type { Metadata } from "next";
import { TaskTemplateForm } from "@/components/admin/admin-forms";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { Card } from "@/components/ui/card";
import { requireAdminPage } from "@/server/admin/admin-access";
import { getTemplateFormOptions } from "@/server/admin/admin-content-service";

export const metadata: Metadata = { title: "Template tugas baru" };

export default async function NewTaskTemplatePage() {
  const admin = await requireAdminPage();
  const options = await getTemplateFormOptions(admin.id);
  return (
    <>
      <AdminPageHeader title="Template tugas baru" />
      <Card>
        <TaskTemplateForm
          mode="create"
          options={{
            categories: options.categories.filter((category) => category.isActive),
            eventTypes: options.eventTypes,
            marriageProcesses: options.marriageProcesses,
          }}
          defaults={{
            title: "",
            description: "",
            categoryId: options.categories.find((category) => category.isActive)?.id ?? "",
            priority: "MEDIUM",
            deadlineOffsetDays: "-90",
            isActive: true,
            eventTypeIds: options.eventTypes.map((item) => item.id),
            marriageProcessIds: options.marriageProcesses.map((item) => item.id),
          }}
        />
      </Card>
    </>
  );
}
