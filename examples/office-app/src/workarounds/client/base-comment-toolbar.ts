import {
  BASE_TOOLBAR_BEFORE_EXTRA_ACTIONS,
  BASE_TOOLBAR_EXTRA_ACTIONS,
} from "@univerjs-pro/bases-ui";
import type { Univer } from "@univerjs/core";
import { ComponentManager, IUIPartsService } from "@univerjs/ui";

/**
 * Workaround for @univerjs-pro/bases-thread-comment-ui
 * 1.0.0-insiders.20260831-796c4f4.
 *
 * 该版本把官方 Comment 按钮注册到了不会被当前 Base toolbar 渲染的 slot。这里仅把官方组件
 * 桥接到可见 slot，不复制按钮行为。上游改为直接注册可渲染 slot 后删除此文件和调用点。
 */
export function installBaseCommentToolbarWorkaround(univer: Univer) {
  const injector = univer.__getInjector();
  const componentManager = injector.get(ComponentManager);

  return injector.get(IUIPartsService).registerComponent(
    BASE_TOOLBAR_EXTRA_ACTIONS,
    () => function BaseCommentToolbarWorkaround() {
      const OfficialCommentButton = componentManager.get(
        BASE_TOOLBAR_BEFORE_EXTRA_ACTIONS,
      );

      return OfficialCommentButton
        ? componentManager.reactUtils.createElement(OfficialCommentButton)
        : null;
    },
  );
}
