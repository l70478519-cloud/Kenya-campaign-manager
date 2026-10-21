import { useState } from "react";
import { useRegisterVolunteer } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, HeartHandshake, Users } from "lucide-react";

const WARDS = ["Ukia", "Kee", "Kilungu", "Ilima"];

const INTEREST_OPTIONS = [
  "Door-to-door canvassing",
  "Phone banking",
  "Social media & digital",
  "Event organizing",
  "Voter registration drives",
  "Data entry",
  "Driver / Logistics",
  "Youth mobilization",
  "Polling agent",
];

const AVAILABILITY_OPTIONS = ["Weekdays", "Weekends", "Evenings", "Full-time", "Flexible"];

export default function VolunteerRegister() {
  const register = useRegisterVolunteer();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [ward, setWard] = useState("");
  const [availability, setAvailability] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const toggleInterest = (opt: string, checked: boolean) => {
    setInterests((prev) => (checked ? [...prev, opt] : prev.filter((v) => v !== opt)));
  };

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast({ title: "Please enter your first and last name", variant: "destructive" });
      return;
    }
    if (phone.trim().length < 7) {
      toast({ title: "Please enter a valid phone number", variant: "destructive" });
      return;
    }
    try {
      await register.mutateAsync({
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          ward: ward || undefined,
          interests: interests.join(", ") || undefined,
          availability: availability || undefined,
          message: message.trim() || undefined,
        },
      });
      setSubmitted(true);
    } catch {
      toast({ title: "Registration failed", description: "Please try again in a moment.", variant: "destructive" });
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 px-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
            <div>
              <h2 className="text-2xl font-bold">Karibu! You're in.</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Thank you for stepping up, {firstName}. Our team will reach out on the number you provided to
                confirm your role and next steps.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="overflow-hidden">
          <div className="bg-emerald-600 px-6 py-8 text-white">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-white/15 flex items-center justify-center">
                <HeartHandshake className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-emerald-100">Hon. Job Tuta · Kaiti Constituency</p>
                <h1 className="text-2xl font-bold leading-tight">Join the Volunteer Team</h1>
              </div>
            </div>
            <p className="text-sm text-emerald-50 mt-4">
              Be part of the movement. Fill in your details below and our coordinators will get you plugged in
              with a team in your area.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" /> Your Details
            </CardTitle>
            <CardDescription>Fields marked with * are required.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">First Name *</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Last Name *</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone Number *</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" type="tel" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ward</Label>
                <Select value={ward} onValueChange={setWard}>
                  <SelectTrigger><SelectValue placeholder="Select your ward" /></SelectTrigger>
                  <SelectContent>
                    {WARDS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Availability</Label>
                <Select value={availability} onValueChange={setAvailability}>
                  <SelectTrigger><SelectValue placeholder="When can you help?" /></SelectTrigger>
                  <SelectContent>
                    {AVAILABILITY_OPTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">How would you like to help?</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {INTEREST_OPTIONS.map((opt) => {
                  const checked = interests.includes(opt);
                  return (
                    <label
                      key={opt}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                        checked ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-input hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-emerald-600 h-4 w-4"
                        checked={checked}
                        onChange={(e) => toggleInterest(opt, e.target.checked)}
                      />
                      {opt}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Anything else you'd like us to know?</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Optional message..." />
            </div>

            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" size="lg" onClick={handleSubmit} disabled={register.isPending}>
              {register.isPending ? "Submitting..." : "Register as a Volunteer"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              By registering you agree to be contacted by the campaign team about volunteering opportunities.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
