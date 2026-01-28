import { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

//Even though this component is just passing its children through,
//the presence of this file is required for `next-intl` to work.
export default function RootLayout({ children }: Props) {
  return children;
}
