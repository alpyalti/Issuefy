import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 24px",
      background: "var(--bg)",
    }}>
      <SignUp
        appearance={{
          variables: {
            colorPrimary: "#2D5BE3",
            colorText: "#15171A",
            colorTextSecondary: "#565B62",
            colorBackground: "#FFFFFF",
            colorInputBackground: "#FFFFFF",
            colorInputText: "#15171A",
            borderRadius: "10px",
            fontFamily: "var(--sans)",
          },
        }}
      />
    </div>
  );
}
