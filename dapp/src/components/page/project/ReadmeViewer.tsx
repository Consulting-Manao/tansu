import { useStore } from "@nanostores/react";
import Markdown from "markdown-to-jsx";
import { useEffect, useState } from "react";
import { fetchReadmeContentFromConfigUrl } from "../../../service/GithubService";
import { loadProjectInfo, loadConfigData } from "../../../service/StateService";
import {
  configData as configDataStore,
  projectInfoLoaded,
} from "../../../utils/store";

const ReadmeViewer = () => {
  const isProjectInfoLoaded = useStore(projectInfoLoaded);
  const configData = useStore(configDataStore);

  const [readmeContent, setReadmeContent] = useState("");

  const loadReadme = async () => {
    if (!isProjectInfoLoaded) return;

    const projectInfo = loadProjectInfo();
    const cfg = loadConfigData();

    if (!projectInfo) return;

    const projectType = cfg?.projectType || "SOFTWARE";

    if (projectType === "SOFTWARE") {
      const configUrl = projectInfo.config.url;

      if (configUrl) {
        const content = await fetchReadmeContentFromConfigUrl(configUrl);

        // Only fallback if truly null/undefined (not empty string)
        if (content !== undefined && content !== null) {
          setReadmeContent(content);
        } else {
          setReadmeContent("No README available for this project.");
        }
      }
    } else {
      // Non-software projects → README comes from TOML (configData)

      const readme = cfg?.readmeContent;

      // FIX: do NOT use truthy check
      if (readme !== undefined && readme !== null) {
        setReadmeContent(readme);
      } else {
        setReadmeContent("No README available for this project.");
      }
    }
  };

  useEffect(() => {
    loadReadme();
  }, [isProjectInfoLoaded, configData]);

  return (
    <div className="markdown-body border border-gray-200 rounded h-auto max-h-[60vh] overflow-y-auto overflow-x-hidden p-4">
      <Markdown
        options={{
          disableParsingRawHTML: true,
          overrides: {
            img: {
              props: {
                className: "max-w-full h-auto",
              },
            },
            table: {
              props: {
                className: "table-auto border-collapse max-w-full",
              },
            },
            th: {
              props: {
                className: "border border-gray-300 px-4 py-2",
              },
            },
            td: {
              props: {
                className: "border border-gray-300 px-4 py-2",
              },
            },
            pre: {
              props: {
                className: "max-w-full overflow-x-auto",
              },
            },
            code: {
              props: {
                className: "max-w-full overflow-x-auto",
              },
            },
          },
        }}
      >
        {readmeContent}
      </Markdown>
    </div>
  );
};

export default ReadmeViewer;
