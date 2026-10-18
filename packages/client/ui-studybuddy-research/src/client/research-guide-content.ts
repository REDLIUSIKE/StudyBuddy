/** Ordered, locale-owned guide chapters; reading them has no research side effects. */
import type { ResearchLocaleKey } from './locales.ts'
interface ResearchGuideChapter {
  readonly id: string
  readonly title: ResearchLocaleKey
  readonly text: ResearchLocaleKey
  readonly sections: readonly { readonly title: ResearchLocaleKey; readonly body: ResearchLocaleKey }[]
}
/** Stable chapters used by the reader and its directory. */
export const researchGuideChapters = [
  {
    "id": "overview",
    "title": "guideOverviewTitle",
    "text": "guideOverviewText",
    "sections": [
      {
        "title": "guideOverviewSection1Title",
        "body": "guideOverviewSection1Body"
      },
      {
        "title": "guideOverviewSection2Title",
        "body": "guideOverviewSection2Body"
      },
      {
        "title": "guideOverviewSection3Title",
        "body": "guideOverviewSection3Body"
      }
    ]
  },
  {
    "id": "projects",
    "title": "guideProjectsTitle",
    "text": "guideProjectsText",
    "sections": [
      {
        "title": "guideProjectsSection1Title",
        "body": "guideProjectsSection1Body"
      },
      {
        "title": "guideProjectsSection2Title",
        "body": "guideProjectsSection2Body"
      },
      {
        "title": "guideProjectsSection3Title",
        "body": "guideProjectsSection3Body"
      }
    ]
  },
  {
    "id": "conversation",
    "title": "guideConversationTitle",
    "text": "guideConversationText",
    "sections": [
      {
        "title": "guideConversationSection1Title",
        "body": "guideConversationSection1Body"
      },
      {
        "title": "guideConversationSection2Title",
        "body": "guideConversationSection2Body"
      },
      {
        "title": "guideConversationSection3Title",
        "body": "guideConversationSection3Body"
      }
    ]
  },
  {
    "id": "workflows",
    "title": "guideWorkflowsTitle",
    "text": "guideWorkflowsText",
    "sections": [
      {
        "title": "guideWorkflowsSection1Title",
        "body": "guideWorkflowsSection1Body"
      },
      {
        "title": "guideWorkflowsSection2Title",
        "body": "guideWorkflowsSection2Body"
      },
      {
        "title": "guideWorkflowsSection3Title",
        "body": "guideWorkflowsSection3Body"
      }
    ]
  },
  {
    "id": "skills-specialists",
    "title": "guideSkillsSpecialistsTitle",
    "text": "guideSkillsSpecialistsText",
    "sections": [
      {
        "title": "guideSkillsSpecialistsSection1Title",
        "body": "guideSkillsSpecialistsSection1Body"
      },
      {
        "title": "guideSkillsSpecialistsSection2Title",
        "body": "guideSkillsSpecialistsSection2Body"
      },
      {
        "title": "guideSkillsSpecialistsSection3Title",
        "body": "guideSkillsSpecialistsSection3Body"
      }
    ]
  },
  {
    "id": "records",
    "title": "guideRecordsTitle",
    "text": "guideRecordsText",
    "sections": [
      {
        "title": "guideRecordsSection1Title",
        "body": "guideRecordsSection1Body"
      },
      {
        "title": "guideRecordsSection2Title",
        "body": "guideRecordsSection2Body"
      },
      {
        "title": "guideRecordsSection3Title",
        "body": "guideRecordsSection3Body"
      }
    ]
  },
  {
    "id": "services",
    "title": "guideServicesTitle",
    "text": "guideServicesText",
    "sections": [
      {
        "title": "guideServicesSection1Title",
        "body": "guideServicesSection1Body"
      },
      {
        "title": "guideServicesSection2Title",
        "body": "guideServicesSection2Body"
      },
      {
        "title": "guideServicesSection3Title",
        "body": "guideServicesSection3Body"
      }
    ]
  },
  {
    "id": "settings-billing",
    "title": "guideSettingsBillingTitle",
    "text": "guideSettingsBillingText",
    "sections": [
      {
        "title": "guideSettingsBillingSection1Title",
        "body": "guideSettingsBillingSection1Body"
      },
      {
        "title": "guideSettingsBillingSection2Title",
        "body": "guideSettingsBillingSection2Body"
      },
      {
        "title": "guideSettingsBillingSection3Title",
        "body": "guideSettingsBillingSection3Body"
      }
    ]
  },
  {
    "id": "advanced",
    "title": "guideAdvancedTitle",
    "text": "guideAdvancedText",
    "sections": [
      {
        "title": "guideAdvancedSection1Title",
        "body": "guideAdvancedSection1Body"
      },
      {
        "title": "guideAdvancedSection2Title",
        "body": "guideAdvancedSection2Body"
      },
      {
        "title": "guideAdvancedSection3Title",
        "body": "guideAdvancedSection3Body"
      }
    ]
  }
] as const satisfies readonly ResearchGuideChapter[]
