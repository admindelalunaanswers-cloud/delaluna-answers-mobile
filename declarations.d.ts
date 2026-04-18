declare module "*.svg" {
  import { ComponentType } from "react";
  import { SvgProps } from "react-native-svg";
  const content: ComponentType<SvgProps>;
  export default content;
}

declare module "*.png" {
  import { ImageSourcePropType } from "react-native";
  const content: ImageSourcePropType;
  export default content;
}
