/** Run with playwright-cli run-code --filename scripts/check-students.playwright.js against local Vite. Uses only mocked API data. */
async function checkStudents(page) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  let students = [];
  let lessons = [];
  let failLoad = false;
  let failSave = false;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.unrouteAll();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/auth/session") return route.fulfill({ json: { authenticated: true } });
    if (path === "/api/lessons") {
      if (method === "GET") return route.fulfill({ json: { lessons } });
      check(method === "POST", "Student management must not edit or delete saved lessons");
      const lesson = { ...request.postDataJSON(), version: 1 };
      lessons.push(lesson);
      return route.fulfill({ status: 201, json: { lesson } });
    }
    check(path === "/api/lesson-presets", `Unexpected API: ${path}`);
    if (method === "GET") {
      if (failLoad) {
        return route.fulfill({ status: 500, json: { error: "测试加载失败" } });
      }
      return route.fulfill({ json: { presets: students } });
    }
    const values = request.postDataJSON();
    if (failSave) {
      failSave = false;
      return route.fulfill({ status: 409, json: { error: "测试版本冲突，请重新加载" } });
    }
    if (method === "POST") {
      const preset = { ...values, id: "student-1", version: 1 };
      students.push(preset);
      return route.fulfill({ status: 201, json: { preset } });
    }
    const existing = students.find((student) => student.id === values.id);
    check(existing?.version === values.version, "Edits and deletes must send the current version");
    if (method === "PUT") {
      const preset = { ...values, version: values.version + 1 };
      students = students.map((student) => (student.id === preset.id ? preset : student));
      return route.fulfill({ json: { preset } });
    }
    check(method === "DELETE", "Unexpected student mutation");
    students = students.filter((student) => student.id !== values.id);
    return route.fulfill({ json: { ok: true } });
  });

  for (const width of [1280, 390]) {
    students = [];
    lessons = [];
    await page.setViewportSize({ width, height: 844 });
    await page.goto("http://127.0.0.1:5173");
    const manage = () => page.getByRole("button", { name: "学生管理", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const button = (name) => dialog.getByRole("button", { name, exact: true });
    const createLesson = async () => {
      if (width < 640) await page.getByRole("button", { name: "添加课程", exact: true }).click();
      else
        await page
          .getByRole("button", { name: "15", exact: true })
          .locator("..")
          .locator("..")
          .locator(":scope > div")
          .nth(1)
          .click();
      await page.getByRole("heading", { name: "新增课程", exact: true }).waitFor();
    };

    await manage();
    await button("新增学生").click();
    await button("保存学生").click();
    await dialog.getByRole("alert").waitFor();
    check(students.length === 0, "Blank names must not be saved");
    await dialog.getByRole("textbox", { name: "学生姓名" }).fill("小九");
    await dialog.getByRole("textbox", { name: "默认备注" }).fill("数学一对一");
    await button("保存学生").click();
    await button("编辑学生 小九").waitFor();
    await button("编辑学生 小九").click();
    await dialog.getByRole("textbox", { name: "默认备注" }).fill("英语一对一");
    failSave = true;
    await button("保存学生").click();
    await dialog.getByRole("alert").waitFor();
    check(
      (await dialog.getByRole("textbox", { name: "默认备注" }).inputValue()) === "英语一对一",
      "Failed saves must retain input",
    );
    await button("重新加载学生").click();
    await button("编辑学生 小九").click();
    await dialog.getByRole("textbox", { name: "默认备注" }).fill("英语一对一");
    await button("保存学生").click();
    await button("编辑学生 小九").waitFor();
    await button("关闭").click();
    await dialog.waitFor({ state: "hidden" });

    await createLesson();
    await button("小九 · 英语一对一").click();
    check(
      (await dialog.getByRole("textbox", { name: /^名称/ }).inputValue()) === "小九",
      "Selection must fill the lesson name",
    );
    check(
      (await dialog.getByRole("textbox", { name: "备注", exact: true }).inputValue()) ===
        "英语一对一",
      "Selection must fill lesson notes",
    );
    await button("保存").click();
    await dialog.waitFor({ state: "hidden" });
    check(lessons.length === 1, "Lesson must be saved separately");
    const savedLesson = JSON.stringify(lessons[0]);

    await manage();
    await button("编辑学生 小九").click();
    await dialog.getByRole("textbox", { name: "学生姓名" }).fill("小九同学");
    await dialog.getByRole("textbox", { name: "默认备注" }).fill("新的默认备注");
    await button("保存学生").click();
    await button("编辑学生 小九同学").waitFor();
    await page.screenshot({ path: `.playwright-cli/student-manager-${width}.png` });
    await button("关闭").click();
    await dialog.waitFor({ state: "hidden" });
    await createLesson();
    await button("小九同学 · 新的默认备注").click();
    check(
      (await dialog.getByRole("textbox", { name: "备注", exact: true }).inputValue()) ===
        "新的默认备注",
      "Reopening must load updated students",
    );
    await button("取消").click();
    await dialog.waitFor({ state: "hidden" });

    await manage();
    await button("删除学生 小九同学").click();
    check(
      (await dialog.getByRole("textbox", { name: /^学生姓名/ }).count()) === 0,
      "Deletion must be available directly from the list",
    );
    await button("取消删除").click();
    check(students.length === 1, "Cancelling deletion must retain the student");
    await button("删除学生 小九同学").click();
    await button("确认删除").click();
    await dialog.getByText("暂无学生，点击“新增学生”添加。", { exact: true }).waitFor();
    check(students.length === 0, "Confirmed deletion must remove the student");
    check(
      JSON.stringify(lessons[0]) === savedLesson,
      "Student edits and deletion must preserve saved lesson snapshots",
    );
    await button("关闭").click();
    await dialog.waitFor({ state: "hidden" });

    failLoad = true;
    await manage();
    await dialog.getByRole("alert").waitFor();
    failLoad = false;
    await button("重新加载学生").click();
    await button("新增学生").waitFor({ state: "visible" });
    await button("新增学生").click();
    await dialog.getByRole("textbox", { name: "学生姓名" }).fill("可重试");
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      "Layout must fit the viewport",
    );
    await button("取消").click();
    await button("关闭").click();
    await dialog.waitFor({ state: "hidden" });
    await createLesson();
    await dialog.getByText("暂无学生，可在顶部“学生管理”中添加。", { exact: true }).waitFor();
    await button("取消").click();
    await dialog.waitFor({ state: "hidden" });
  }
  check(errors.length === 0, `Browser errors: ${errors.join(", ")}`);
  console.log(
    "PASS: desktop/mobile student CRUD, validation, conflict recovery, selection, fresh data, and lesson preservation",
  );
}
