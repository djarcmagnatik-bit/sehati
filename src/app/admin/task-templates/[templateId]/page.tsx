import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TaskTemplateForm } from "@/components/admin/admin-forms";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { Card } from "@/components/ui/card";
import { requireAdminPage } from "@/server/admin/admin-access";
import { getTaskTemplateForAdmin, getTemplateFormOptions } from "@/server/admin/admin-content-service";

export const metadata: Metadata = { title: "Ubah template tugas" };

export default async function EditTaskTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const admin = await requireAdminPage();
  const { templateId } = await params;
  const [template, options] = await Promise.all([getTaskTemplateForAdmin(admin.id, templateId), getTemplateFormOptions(admin.id)]);
  if (!template) notFound();

  return (
    <>
      <AdminPageHeader
        title="Ubah template tugas"
        description={`${template.code} · sudah menghasilkan ${template._count.tasks} tugas, yang tidak ikut berubah.`}
      />
      <Card>
        <TaskTemplateForm
          mode="edit"
          templateId={template.id}
          options={{
            // Keep the template's current category selectable even if it was deactivated.
            categories: options.categories.filter((category) => category.isActive || category.id === template.categoryId),
            eventTypes: options.eventTypes,
            marriageProcesses: options.marriageProcesses,
          }}
          defaults={{
            title: template.title,
            description: template.description ?? "",
            categoryId: template.categoryId,
            priority: template.priority,
            deadlineOffsetDays: template.deadlineOffsetDays.toString(),
            isActive: template.isActive,
            eventTypeIds: template.eventTypes.map((row) => row.eventTypeId),
            marriageProcessIds: template.marriageProcesses.map((row) => row.marriageProcessId),
          }}
        />
      </Card>
    </>
  );
}
